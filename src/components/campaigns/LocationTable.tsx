"use client";

interface LocationRow {
  city: string;
  province: string | null;
  country: string | null;
  neighbourhood: string | null;
  count: number;
}

interface Props {
  locations: LocationRow[];
  isEmail: boolean;
}

export default function LocationTable({ locations, isEmail }: Props) {
  const hasNeighbourhood = locations.some((l) => l.neighbourhood);

  if (locations.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-[#1e2a38]/40">No location data yet</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1e2a38]/10">
            <th className="text-left text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wide py-2.5 px-4">City</th>
            <th className="text-left text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wide py-2.5 px-4">Province / State</th>
            <th className="text-left text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wide py-2.5 px-4">Country</th>
            {hasNeighbourhood && (
              <th className="text-left text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wide py-2.5 px-4">Neighbourhood</th>
            )}
            <th className="text-right text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wide py-2.5 px-4">
              {isEmail ? "Unique Clicks" : "Clicks"}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1e2a38]/5">
          {locations.map((row, i) => (
            <tr key={i} className="hover:bg-[#f8f9fa] transition-colors">
              <td className="py-2.5 px-4 font-medium text-[#1e2a38]">{row.city}</td>
              <td className="py-2.5 px-4 text-[#1e2a38]/60">{row.province ?? "—"}</td>
              <td className="py-2.5 px-4 text-[#1e2a38]/60">{row.country ?? "—"}</td>
              {hasNeighbourhood && (
                <td className="py-2.5 px-4 text-[#1e2a38]/60">{row.neighbourhood ?? "—"}</td>
              )}
              <td className="py-2.5 px-4 text-right font-semibold text-[#1e2a38]">{row.count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
