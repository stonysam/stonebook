import Link from 'next/link';
import { DecideButtons } from '@/components/decide-buttons';
import { dateText } from '@/lib/format';
import { loadWorld, memberName } from '@/lib/world';

export const metadata = { title: 'Waiting for you · Stonebook' };

export default async function Approvals() {
  const w = await loadWorld();
  const mine = w.me.role === 'parent' ? w.pending : [];
  return (
    <main className="page">
      <Link href="/" className="btn btn-text" style={{ alignSelf: 'flex-start', padding: 0 }}>Back</Link>
      <header>
        <h1>Waiting for you</h1>
        <p className="muted" style={{ margin: '6px 0 0' }}>Lucy&apos;s and Benji&apos;s chores count once a parent says yes.</p>
      </header>
      {mine.map((p) => (
        <div key={p.event_id} className="card stack" style={{ gap: 12 }}>
          <div>
            <div className="item-title">{memberName(w, p.created_by)}: {p.object_name}</div>
            <div className="small">
              {p.kind} · {dateText(p.occurred_on, w.today)}
              {p.assigned_by ? ` · set by ${memberName(w, p.assigned_by).replace('You', 'you')}` : ''}
              {p.note ? ` · "${p.note}"` : ''}
            </div>
          </div>
          <DecideButtons eventId={p.event_id} who={memberName(w, p.created_by)} />
        </div>
      ))}
      {mine.length === 0 && <div className="card dashed" style={{ textAlign: 'center', padding: 32 }}>All caught up.</div>}
    </main>
  );
}
