import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dateText, possessive, whenText } from '@/lib/format';
import { dueFor, eventsOf, loadWorld, typeOf } from '@/lib/world';

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const w = await loadWorld();
  const { id } = await params;
  const person = w.members.find((m) => m.id === id);
  if (!person) notFound();
  const isMe = person.id === w.me.id;
  const name = isMe ? 'Your' : possessive(person.display_name);

  const owned = w.objects.filter((o) => o.owner_id === person.id && !o.archived_at);
  const chores = owned.filter((o) => typeOf(w, o)?.name === 'Chore');
  const others = owned.filter((o) => typeOf(w, o)?.name !== 'Chore');
  const recent = w.events.filter((e) => e.created_by === person.id).slice(0, 15);
  const waiting = w.pending.filter((p) => p.created_by === person.id);
  const objectName = (oid: string) => w.objects.find((o) => o.id === oid)?.name ?? '';

  const choreRows = chores.map((o) => {
    const rules = w.rules.filter((r) => r.object_id === o.id).map((r) => dueFor(w, r)).filter((d) => d !== null);
    const next = rules.filter((d) => d.due.dueOn).sort((a, b) => (a.due.dueOn ?? '').localeCompare(b.due.dueOn ?? ''))[0];
    const last = eventsOf(w, o.id)[0];
    return { o, rules, next, last };
  });

  return (
    <main className="page">
      <Link href="/family" className="btn btn-text" style={{ alignSelf: 'flex-start', padding: 0 }}>Back to Family</Link>
      <h1>{isMe ? 'You' : person.display_name}</h1>

      <section className="stack" aria-label="Chores">
        <div className="row">
          <h2 className="eyebrow">{name} chores</h2>
          <span className="spacer" />
          {w.me.role === 'parent' && (
            <Link href={`/add?type=${w.types.find((t) => t.name === 'Chore')?.id ?? ''}&owner=${person.id}`} className="btn">
              Add a chore{isMe ? '' : ` for ${person.display_name}`}
            </Link>
          )}
        </div>
        {choreRows.length === 0 && <div className="card small">No chores yet.</div>}
        {choreRows.map(({ o, rules, next, last }) => (
          <Link key={o.id} href={`/things/${o.id}`} className="card card-link">
            <span className="item-title">{o.name}</span>
            <span className="muted" style={{ fontSize: 14 }}>{rules.map((d) => d.due.basis.split('.')[0]).join(' · ') || 'No schedule'}</span>
            <span style={{ fontSize: 14 }}>
              {next ? <span className={next.bucket === 'overdue' ? 'overdue' : ''}>Next: {whenText(next.due.dueOn, w.today)}</span> : null}
              {last ? <span className="muted">{next ? ' · ' : ''}last done {dateText(last.occurred_on, w.today).toLowerCase()}</span> : null}
            </span>
          </Link>
        ))}
        {waiting.length > 0 && (
          <div className="card dashed small">
            {waiting.length} done and waiting for Mum or Dad: {waiting.map((p) => p.object_name).join(', ')}
          </div>
        )}
      </section>

      <section className="stack" aria-label="Other things">
        <h2 className="eyebrow">{name} other things</h2>
        {others.length === 0 && <div className="card small">Nothing else.</div>}
        {others.map((o) => (
          <Link key={o.id} href={`/things/${o.id}`} className="card card-link">
            <span className="item-title">{o.name}</span>
            <span className="small">{typeOf(w, o)?.name}{o.visibility !== 'shared' ? ` · ${o.visibility}` : ''}</span>
          </Link>
        ))}
      </section>

      <section className="stack" aria-label="Recently logged">
        <h2 className="eyebrow">Recently logged by {isMe ? 'you' : person.display_name}</h2>
        {recent.length === 0 && <div className="card small">Nothing logged yet.</div>}
        <div className="list">
          {recent.map((e) => (
            <Link key={e.id} href={`/things/${e.object_id}`} className="list-item">
              <span style={{ flex: '1 1 auto' }}>
                <span className="item-title" style={{ display: 'block' }}>{e.kind}</span>
                <span className="small">{objectName(e.object_id)} · {dateText(e.occurred_on, w.today)}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
