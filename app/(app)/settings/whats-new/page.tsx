import Link from '@/components/link';
import { NoteBody } from '@/components/whats-new';
import { getMe } from '@/lib/auth';
import { dateText } from '@/lib/format';
import { notesFor } from '@/lib/whats-new';
import { todayIn } from '@/src/engine/dates';

export const metadata = { title: 'What’s new · Stonebook' };

export default async function WhatsNewList() {
  const { me } = await getMe();
  const today = todayIn('Europe/Prague');
  return (
    <main className="page">
      <Link href="/settings" className="btn btn-text" style={{ alignSelf: 'flex-start', padding: 0 }}>Back to Settings</Link>
      <h1>What’s new</h1>
      {notesFor(me.role).map((n) => (
        <article key={n.id} className="card stack" style={{ gap: 12 }}>
          <div className="small">{dateText(n.date, today)}</div>
          <h2 style={{ margin: 0 }}>{n.title}</h2>
          <NoteBody note={n} />
          {n.href && <Link href={n.href} className="btn" style={{ alignSelf: 'flex-start' }}>Show me</Link>}
        </article>
      ))}
    </main>
  );
}
