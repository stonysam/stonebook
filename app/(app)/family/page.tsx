import Link from '@/components/link';
import { choresOf, loadWorld } from '@/lib/world';

export const metadata = { title: 'Family · Stonebook' };

const ROLE: Record<string, string> = { parent: 'Parent', member: 'Member', junior: 'Junior', child: 'Family device, PIN' };

export default async function Family() {
  const w = await loadWorld();
  return (
    <main className="page">
      <h1>Family</h1>
      <section className="list" aria-label="Family members">
        {w.members.map((m) => {
          const chores = choresOf(w, m.id).length;
          return (
            <Link key={m.id} href={`/family/${m.id}`} className="list-item">
              <span style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }} aria-hidden="true">
                {m.display_name[0]}
              </span>
              <span style={{ flex: '1 1 auto' }}>
                <span className="item-title" style={{ display: 'block' }}>{m.id === w.me.id ? `${m.display_name} (you)` : m.display_name}</span>
                <span className="small">{ROLE[m.role]}{chores ? ` · ${chores === 1 ? '1 chore or task' : `${chores} chores and tasks`}` : ''}</span>
              </span>
              <span aria-hidden="true" className="muted">›</span>
            </Link>
          );
        })}
      </section>

      <Link href="/settings" className="card card-link">
        <span className="item-title">Reminders, calendar and tablet</span>
        <span className="muted" style={{ fontSize: 14 }}>Morning summary and lift reminders on your phone, your private calendar link{w.me.role === 'parent' ? ', and Benji mode for the family tablet' : ''}.</span>
      </Link>

      <form action="/auth/signout" method="post">
        <button className="btn btn-block">Sign out</button>
      </form>
    </main>
  );
}
