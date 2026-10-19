// Simple line pictures for chores, so a young child can read the list at a glance.
// Names match the options of the "picture" field on Chore or task.
const P: Record<string, React.ReactNode> = {
  hens: <><path d="M14 30c0-8 6-14 14-14 2-5 8-6 10-2-3 0-4 2-4 4 3 2 5 6 5 10 0 7-6 12-13 12s-12-4-12-10z" /><path d="M38 18l5 1-4 3" /><circle cx="35" cy="17" r="1" fill="currentColor" /><path d="M24 42v4M30 42v4" /><path d="M18 30c4 3 10 3 13-1" /></>,
  eggs: <><ellipse cx="18" cy="28" rx="8" ry="11" /><ellipse cx="31" cy="30" rx="8" ry="11" /><path d="M8 38h32" /></>,
  dog: <><path d="M12 20l-4 10 6 2M36 20l4 10-6 2" /><path d="M14 18c2-4 6-6 10-6s8 2 10 6v12c0 6-4 10-10 10s-10-4-10-10z" /><circle cx="20" cy="24" r="1.5" fill="currentColor" /><circle cx="28" cy="24" r="1.5" fill="currentColor" /><path d="M22 31h4l-2 3z" /></>,
  cat: <><path d="M13 12l4 9M35 12l-4 9" /><path d="M13 12c-1 6-1 12 1 18 2 6 6 10 10 10s8-4 10-10c2-6 2-12 1-18l-6 8h-10z" /><circle cx="20" cy="27" r="1.5" fill="currentColor" /><circle cx="28" cy="27" r="1.5" fill="currentColor" /><path d="M22 32h4M10 30l8 1M38 30l-8 1" /></>,
  bin: <><path d="M12 14h24M20 14v-4h8v4" /><path d="M14 14l2 28h16l2-28" /><path d="M21 20v16M27 20v16" /></>,
  dishes: <><circle cx="22" cy="26" r="13" /><circle cx="22" cy="26" r="7" /><path d="M40 10v32M37 10v8c0 2 1.5 3 3 3s3-1 3-3v-8" /></>,
  table: <><path d="M6 20h36M10 20v20M38 20v20M6 26h36" /><path d="M16 14h6M28 14c0-3 4-3 4 0" /></>,
  bed: <><path d="M6 36V14M6 28h36v8M42 36v-8" /><rect x="10" y="20" width="10" height="8" rx="2" /><path d="M20 28v-6h18c2 0 4 2 4 4v2" /></>,
  toys: <><rect x="8" y="26" width="14" height="14" rx="2" /><path d="M12 33h6M15 30v6" /><circle cx="33" cy="33" r="7" /><path d="M26 10l8 0 4 8h-16z" /></>,
  laundry: <><path d="M16 8l-8 6 4 8 4-2v20h16V20l4 2 4-8-8-6c-1 3-4 5-8 5s-7-2-8-5z" /></>,
  plants: <><path d="M10 22h20l-3 18H13z" /><path d="M30 26l10-6" /><path d="M14 22c0-6 2-10 6-12 1 4 0 8-3 12M24 22c0-4 3-8 7-8 0 4-3 7-6 8" /></>,
  teeth: <path d="M14 9c4-2 7 0 10 0s6-2 10 0c4 2 4 10 2 16-2 5-2 15-5 15s-3-9-7-9-4 9-7 9-3-10-5-15c-2-6-2-14 2-16z" />,
  book: <><path d="M24 12c-4-3-10-4-16-3v28c6-1 12 0 16 3 4-3 10-4 16-3V9c-6-1-12 0-16 3z" /><path d="M24 12v28" /></>,
  broom: <><path d="M34 6L22 26" /><path d="M22 26l-10 6 4 10 12-8z" /><path d="M16 36l4-3M19 40l4-3" /></>,
  logs: <><circle cx="14" cy="32" r="6" /><circle cx="34" cy="32" r="6" /><circle cx="24" cy="18" r="6" /><circle cx="14" cy="32" r="2" /><circle cx="34" cy="32" r="2" /><circle cx="24" cy="18" r="2" /></>,
  star: <path d="M24 7l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" />,
};

export const CHORE_PICTURES = Object.keys(P);

export function ChoreIcon({ name, size = 48, filled = false }: { name: string | null | undefined; size?: number; filled?: boolean }) {
  const node = P[name ?? ''] ?? P.star;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {node}
    </svg>
  );
}
