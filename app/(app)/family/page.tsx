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

      <section className="card stack">
        <strong>Coming next</strong>
        <span className="muted" style={{ fontSize: 14 }}>
          Reminders on your phone and your private calendar link arrive in the next update. Benji&apos;s PIN profile and
          photo import follow after that.
        </span>
      </section>

      <form action="/auth/signout" method="post">
        <button className="btn btn-block">Sign out</button>
      </form>
    </main>
  );
}
