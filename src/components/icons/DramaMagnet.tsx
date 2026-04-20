import { SVGProps } from "react";

/**
 * DramaMagnet — custom icon for videos tagged Drama Mode.
 * Horseshoe magnet with motion pulses — reads as "pulling viewers in" at a glance.
 * Inherits currentColor; pass className for sizing/colour via Tailwind.
 */
export default function DramaMagnet({
  size = 24,
  className,
  ...props
}: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Horseshoe body (U-shape, opening downward) */}
      <path d="M5 4v8a7 7 0 0 0 14 0V4" />
      {/* Pole caps */}
      <line x1="5" y1="9" x2="9" y2="9" />
      <line x1="15" y1="9" x2="19" y2="9" />
      {/* Arm inner edges */}
      <line x1="9" y1="4" x2="9" y2="12" />
      <line x1="15" y1="4" x2="15" y2="12" />
      {/* Attraction pulses */}
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="19" x2="6" y2="21.5" />
      <line x1="16" y1="19" x2="18" y2="21.5" />
    </svg>
  );
}
