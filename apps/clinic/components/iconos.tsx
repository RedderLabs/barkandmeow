/* Iconos dibujados de la consola: trazo 1.8, extremos redondos, heredan currentColor. */

type Props = { size?: number };

const trazo = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export function IconUnlinked({ size = 18 }: Props) {
  return (
    <svg {...trazo(size)}>
      <path d="M9.5 14.5 7 17a4.2 4.2 0 0 1-6-6l2.5-2.5" />
      <path d="M14.5 9.5 17 7a4.2 4.2 0 0 1 6 6l-2.5 2.5" />
      <path d="m3 3 18 18" />
    </svg>
  );
}

export function IconLinked({ size = 18 }: Props) {
  return (
    <svg {...trazo(size)}>
      <path d="M10 14a4.2 4.2 0 0 0 6 0l3.5-3.5a4.2 4.2 0 0 0-6-6L12 6" />
      <path d="M14 10a4.2 4.2 0 0 0-6 0l-3.5 3.5a4.2 4.2 0 0 0 6 6L12 18" />
    </svg>
  );
}

export function IconSealed({ size = 16 }: Props) {
  return (
    <svg {...trazo(size)}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

export function IconPencil({ size = 18 }: Props) {
  return (
    <svg {...trazo(size)}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

/** Un chip leído: la cápsula y las ondas del lector. */
export function IconChip({ size = 20 }: Props) {
  return (
    <svg {...trazo(size)}>
      <rect x="3" y="9" width="12" height="6" rx="3" />
      <path d="M7 12h4" />
      <path d="M18 8.5a5 5 0 0 1 0 7" />
      <path d="M20.5 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

export function IconClock({ size = 20 }: Props) {
  return (
    <svg {...trazo(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconSearch({ size = 18 }: Props) {
  return (
    <svg {...trazo(size)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function IconQuestion({ size = 20 }: Props) {
  return (
    <svg {...trazo(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8" />
      <path d="M12 16.8v.2" />
    </svg>
  );
}
