import type { SVGProps } from "react";

/** Standard SVG element props; className / width / height override the defaults. */
type IconProps = SVGProps<SVGSVGElement>;

const base: IconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const GameIcon = (props: IconProps) => (
  <svg {...base} className="w-6 h-6 text-accent-400" strokeWidth={1.8} {...props}>
    <path d="M6 12h4m-2-2v4m7-1h.01M18 10h.01" />
    <rect x="2" y="6" width="20" height="12" rx="4" />
  </svg>
);

export const SearchIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const GridIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

export const ChartIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M3 3v18h18" />
    <path d="m7 15 4-6 3 3 5-8" />
  </svg>
);

export const GearIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

/** Solid star glyph (read-only displays and the picker all render it filled). */
export const StarIcon = ({ className = "w-4 h-4", ...props }: IconProps) => (
  <svg {...base} {...props} fill="currentColor" className={className}>
    <path d="m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z" />
  </svg>
);

export const HeartIcon = ({
  filled,
  className = "w-4 h-4",
  ...props
}: IconProps & { filled: boolean }) => (
  <svg {...base} {...props} fill={filled ? "currentColor" : "none"} className={className}>
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

export const TrashIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </svg>
);

export const RefreshIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
  </svg>
);

/** Arcade joystick, for library empty states. */
export const JoystickIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="6" r="3" />
    <path d="M12 9v7" />
    <rect x="4" y="16" width="16" height="4" rx="1.5" />
  </svg>
);

/** Party popper, for cycle-complete celebrations. */
export const PartyIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M5.8 11.3 2 22l10.7-3.8" />
    <path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z" />
    <path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12v0" />
    <path d="M14 10l.21-1.06a1.8 1.8 0 0 1 1.76-1.44h.38c.88 0 1.55-.77 1.45-1.63" />
    <path d="m4 3h.01" />
    <path d="M15 2h.01" />
    <path d="M22 8h.01" />
    <path d="M22 20h.01" />
  </svg>
);
