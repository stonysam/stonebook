import Link from '@/components/link';
import { Avatar } from '@/components/avatar';
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
              <Avatar members={w.members} id={m.id} size={40} />
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
        <span className="item-title">Settings</span>
        <span className="muted" style={{ fontSize: 14 }}>Morning summary and lift reminders on your phone, your private calendar link{w.me.role === 'parent' ? ', Benji mode for the family tablet, and kinds of things' : ''}.</span>
      </Link>

      <form action="/auth/signout" method="post">
        <button className="btn btn-block">Sign out</button>
      </form>
    </main>
  );
}
