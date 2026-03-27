"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import "leaflet.markercluster";

interface LocationMarker {
  city: string;
  province: string | null;
  country: string | null;
  count: number;
}

interface Props {
  markers: LocationMarker[];
  height?: number;
}

const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

async function geocodeLocation(
  city: string,
  province: string | null,
  country: string | null
): Promise<{ lat: number; lng: number } | null> {
  const key = `${city}|${province ?? ""}|${country ?? ""}`.toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;

  const parts = [city, province, country].filter(Boolean).join(", ");
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(parts)}&format=json&limit=1`,
      { headers: { "User-Agent": "AttractionByVideo/1.0" } }
    );
    const data = await res.json();
    if (data?.[0]) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geocodeCache.set(key, result);
      return result;
    }
  } catch { /* ignore */ }
  geocodeCache.set(key, null);
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function ClickMapInner({ markers, height = 400 }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [noData, setNoData] = useState(false);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current, { scrollWheelZoom: false }).setView([51.0447, -114.0719], 4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (clusterGroupRef.current) {
      map.removeLayer(clusterGroupRef.current);
      clusterGroupRef.current = null;
    }

    if (markers.length === 0) {
      setNoData(true);
      return;
    }
    setNoData(false);

    const markerIcon = L.circleMarker;

    async function plotMarkers() {
      setGeocoding(true);
      const clusterGroup = L.markerClusterGroup({ maxClusterRadius: 60 });
      const bounds: L.LatLng[] = [];
      let lastRequestTime = 0;

      for (const loc of markers) {
        const now = Date.now();
        const elapsed = now - lastRequestTime;
        if (elapsed < 1100 && lastRequestTime !== 0) {
          await sleep(1100 - elapsed);
        }
        lastRequestTime = Date.now();

        const coords = await geocodeLocation(loc.city, loc.province, loc.country);
        if (!coords) continue;

        const jitter = () => (Math.random() - 0.5) * 0.02;
        for (let i = 0; i < loc.count; i++) {
          const lat = coords.lat + jitter();
          const lng = coords.lng + jitter();
          const ll = L.latLng(lat, lng);
          bounds.push(ll);
          const circle = markerIcon([lat, lng], {
            radius: 7,
            fillColor: "#6ba3c7",
            color: "#1e88c7",
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.7,
          });
          const label = `${loc.city}${loc.province ? `, ${loc.province}` : ""}`;
          circle.bindPopup(`<strong>${label}</strong><br/>${loc.count} click${loc.count !== 1 ? "s" : ""}`);
          clusterGroup.addLayer(circle);
        }
      }

      if (!mapInstanceRef.current) return;
      mapInstanceRef.current.addLayer(clusterGroup);
      clusterGroupRef.current = clusterGroup;

      if (bounds.length > 0) {
        mapInstanceRef.current.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 12 });
      }
      setGeocoding(false);
    }

    plotMarkers();
  }, [markers]);

  return (
    <div className="relative" style={{ height }}>
      <div ref={mapRef} style={{ height: "100%", width: "100%", borderRadius: "0.75rem" }} />
      {geocoding && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/90 border border-[#2f3437]/10 rounded-full px-4 py-1.5 text-xs text-[#2f3437]/60 pointer-events-none z-[500]">
          Geocoding locations…
        </div>
      )}
      {noData && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f8f9fa]/80 rounded-lg z-[500]">
          <p className="text-sm text-[#2f3437]/40">No location data yet</p>
        </div>
      )}
    </div>
  );
}
