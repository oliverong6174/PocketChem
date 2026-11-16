import type { SVGProps } from "react";

/**
 * Small stroke-icon set (24x24, currentColor). Icons are decorative by default (aria-hidden); pass
 * `title` when an icon stands alone. Paths are hand-drawn for the few concepts PocketChem needs so no
 * icon package is bundled.
 */
const PATHS = {
  molecule: "M12 3l6.5 3.75v7.5L12 18l-6.5-3.75v-7.5L12 3zm0 15v3m6.5-6.75l2.6 1.5M5.5 14.25l-2.6 1.5",
  ranking: "M5 20V10m7 10V4m7 16v-7M3 20h18",
  spectrum: "M3 19h18M5 19c.7-5 1.3-9 2-9s1.3 9 2 9m2 0c.6-8 1.3-14 2-14s1.4 6 2 14m2 0c.4-3 .8-5 1.5-5s1.1 2 1.5 5",
  conformations: "M7 7a4 4 0 100 8 4 4 0 000-8zm10 2a4 4 0 100 8 4 4 0 000-8zM10.5 12.5l3-1",
  reactions: "M4 12h13m0 0l-4-4m4 4l-4 4M4 6v0m0 12v0",
  route: "M5 5a2 2 0 104 0 2 2 0 00-4 0zm10 14a2 2 0 104 0 2 2 0 00-4 0zM7 7v4a3 3 0 003 3h4a3 3 0 013 3",
  catalysis: "M9 3h6m-5 0v6l-5 9a2 2 0 001.8 3h10.4a2 2 0 001.8-3l-5-9V3M8 15h8",
  saved: "M6 4h9l3 3v13H6V4zm3 0v5h6V4M9 20v-6h6v6",
  sun: "M12 8a4 4 0 100 8 4 4 0 000-8zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6L7 7m10 10l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4",
  moon: "M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z",
  system: "M4 5h16v11H4V5zm5 15h6m-3-4v4",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  chevron: "M7 10l5 5 5-5",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zm0-10v6m0-9.5v.01",
  warning: "M12 4l9 16H3L12 4zm0 6v5m0 3v.01",
  check: "M5 12.5l4.5 4.5L19 7.5",
  error: "M12 21a9 9 0 100-18 9 9 0 000 18zm-3-12l6 6m0-6l-6 6",
  flask: "M9 3h6m-5 0v6l-5 9a2 2 0 001.8 3h10.4a2 2 0 001.8-3l-5-9V3",
  atom: "M12 11.2a.8.8 0 110 1.6.8.8 0 010-1.6zM12 4c4.5 0 8 3.6 8 8s-3.5 8-8 8-8-3.6-8-8 3.5-8 8-8z",
  physics: "M3 12c3-8 15-8 18 0-3 8-15 8-18 0zm9-1.5v3",
  biology: "M7 4c0 6 10 6 10 12M7 20c0-6 10-6 10-12M8 8h8M8 16h8",
  dna: "M7 3c0 6 10 6 10 12M7 21c0-6 10-6 10-12M8.5 6.5h7M7.5 12h9M8.5 17.5h7",
  rna: "M4 17c3-9 6 3 9-6s5-4 7-6M4 17l2-.5m7-5.5l2 .3",
  operon: "M3 15h18M5 15v-4h4v4m3 0v-6h3v6m3 0v-3h3M7 7a2 2 0 100-.01M14 6l3 2",
  chromosome: "M8 3c2 0 3 2 3 4v10c0 2-1 4-3 4S5 19 5 17V7c0-2 1-4 3-4zm8 0c2 0 3 2 3 4v10c0 2-1 4-3 4s-3-2-3-4V7c0-2 1-4 3-4zM8 11h8",
  cell: "M12 4c5 0 8 3.6 8 8s-3 8-8 8-8-3.6-8-8 3-8 8-8zM9 10c1 1 2 2 3 4m3-4c-1 1-2 2-3 4M9 14c1-1 2-2 3-4m3 4c-1-1-2-2-3-4",
  ribosome: "M4 14a8 6 0 0116 0H4zM6 17h12v2H6v-2zM9 8a3 3 0 106 0",
  biochemistry: "M6 5a2 2 0 104 0 2 2 0 00-4 0zm8 14a2 2 0 104 0 2 2 0 00-4 0zM8 7l8 10M16 7L8 17",
  general: "M4 7h16M4 12h16M4 17h10M18 15v4m-2-2h4",
  equilibrium: "M4 9h13l-3-3m3 3l-3 3M20 15H7l3-3m-3 3l3 3",
  kinetics: "M4 19V5m0 14h16M6 7c3 0 4 8 14 10",
  mechanics: "M3 19h18M4 17c3-12 13-12 16 0M17 8l3 1.5-1.5 3",
  forces: "M12 3v18M12 3l-3 3m3-3l3 3M4 14h16M17 11l3 3-3 3",
  energy: "M13 3L5 13h6l-1 8 9-11h-6l0-7zM3 21h18",
  collisions: "M3 12h5m-2-3l2 3-2 3M21 12h-5m2-3l-2 3 2 3M12 7v10",
  stoichiometry: "M4 5h6M7 5v9M14 19h6M17 14v5M4 19l6-6M3 12h6m9-8v6m-3-3h6",
  gas: "M5 4h14v16H5zM9 9h.01M14 8h.01M11 13h.01M16 14h.01M8 16h.01",
  electro: "M5 4v16M9 4v16M5 8H3M9 14h8a3 3 0 003-3V7M17 4l3 3-3 3M13 20h8",
  waves: "M2 12c2.5-7 5.5-7 8 0s5.5 7 8 0 3-4 4-4",
  optics: "M3 12h18M12 4c-4 4-4 12 0 16M12 4c4 4 4 12 0 16M3 6l9 6M3 18l9-6",
  interference: "M3 8c3-5 6-5 9 0s6 5 9 0M3 16c3-5 6-5 9 0s6 5 9 0",
  circuits: "M3 12h4l1.5-4 3 8 3-8 1.5 4H21M3 12v6h18v-6",
  rc: "M3 8h5M16 8h5M8 8h8M12 11v8M8 11h8M8 14h8M12 19v0",
  thermo: "M10 14.5V5a2 2 0 014 0v9.5a4 4 0 11-4 0zM12 9v7",
  lock: "M7 11V8a5 5 0 0110 0v3M6 11h12v9H6v-9z",
  external: "M14 4h6v6m0-6L10 14M18 14v6H4V6h6",
  refresh: "M20 5v5h-5M4 19v-5h5m11-4a8 8 0 00-14-3M4 14a8 8 0 0014 3",
  flip: "M4 8h13l-3-3m3 3l-3 3M20 16H7l3-3m-3 3l3 3",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zm5 12l4.5 4.5",
} as const;

export type IconName = keyof typeof PATHS;

type Props = Omit<SVGProps<SVGSVGElement>, "title"> & { name: IconName; size?: number; title?: string };

export function Icon({ name, size = 20, title, ...rest }: Props) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={`ui-icon${rest.className ? ` ${rest.className}` : ""}`}
      fill="none"
      focusable="false"
      height={size}
      role={title ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.7}
      viewBox="0 0 24 24"
      width={size}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
