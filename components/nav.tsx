'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const icons: Record<string, React.ReactNode> = {
  today: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="M3.5 6l1.2 1.2 2.3-2.4M3.5 12l1.2 1.2 2.3-2.4M3.5 18l1.2 1.2 2.3-2.4" /></>,
  things: <><path d="M3 8h18v12H3z" /><path d="M3 8l2-4h14l2 4" /><path d="M10 12h4" /></>,
  feed: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  add: <path d="M12 5v14M5 12h14" />,
  family: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M15.5 14.2A5 5 0 0 1 21 19" /></>,
};

export function Nav({ feedCount, showFamily }: { feedCount: number; showFamily: boolean }) {
  const path = usePathname();
  const tabs = [
    { href: '/', key: 'today', label: 'Today', match: (p: string) => p === '/' || p.startsWith('/approvals') },
    { href: '/things', key: 'things', label: 'Things', match: (p: string) => p.startsWith('/things') },
    { href: '/feed', key: 'feed', label: 'Feed', match: (p: string) => p.startsWith('/feed') },
    { href: '/add', key: 'add', label: 'Add', match: (p: string) => p.startsWith('/add') },
    ...(showFamily ? [{ href: '/family', key: 'family', label: 'Family', match: (p: string) => p.startsWith('/family') }] : []),
  ];
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-inner">
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} aria-current={t.match(path) ? 'page' : undefined}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {icons[t.key]}
            </svg>
            <span>{t.label}</span>
            {t.key === 'feed' && feedCount > 0 && <span className="count" aria-label={`${feedCount} new`}>{feedCount}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}
