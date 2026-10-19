import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { SessionCard } from '@/components/session-card';
import { dateText, possessive, whenText } from '@/lib/format';
import { ACTIVITY, CHORE, isActivity } from '@/lib/types';
import { canEditActivity, choresOf, driverOptions, dueFor, eventsForRule, loadWorld, sessionView, typeOf, upcomingSessions } from '@/lib/world';

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const w = await loadWorld();
  const { id } = await params;
  const person = w.members.find((m) => m.id === id);
  if (!person) notFound();
  const isMe = person.id === w.me.id;
  const name = isMe ? 'Your' : possessive(person.display_name);

  const owned = w.objects.filter((o) => o.owner_id === person.id && !o.archived_at);
  const chores = choresOf(w, person.id);
  const activities = owned.filter((o) => isActivity(typeOf(w, o)?.name));
  const others = owned.filter((o) => !typeOf(w, o)?.assignable && !isActivity(typeOf(w, o)?.name));
  const sessions = activities.flatMap((o) => upcomingSessions(w, o.id, 7)).sort((a, b) => (a.date + a.startsAt).localeCompare(b.date + b.startsAt));
  const lifts = w.objects.filter((o) => !o.archived_at && o.owner_id !== person.id)
    .flatMap((o) => upcomingSessions(w, o.id, 7)).filter((s) => !s.cancelled && (s.dropOffBy === person.id || s.pickUpBy === person.id));
  const { drivers, names } = driverOptions(w);
  const canGive = w.me.role !== 'child';
  const canAddActivity = w.me.role === 'parent' || (isMe && w.me.role !== 'child');
  const typeId = (name: string) => w.types.find((t) => t.name === name)?.id ?? '';
  const recent = w.events.filter((e) => e.created_by === person.id).slice(0, 15);
  const waiting = w.pending.filter((p) => p.created_by === person.id);
  const objectName = (oid: string) => w.objects.find((o) => o.id === oid)?.name ?? '';

  const choreRows = chores.map(({ object: o, rules: theirs }) => {
    const rules = theirs.map((r) => dueFor(w, r)).filter((d) => d !== null);
    const next = rules.filter((d) => d.due.dueOn && d.due.status !== 'done').sort((a, b) => (a.due.dueOn ?? '').localeCompare(b.due.dueOn ?? ''))[0];
    const last = theirs.flatMap((r) => eventsForRule(w, r)).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))[0];
    const finished = rules.length > 0 && rules.every((d) => d.due.status === 'done');
    return { o, rules, next, last, finished };
  }).sort((a, b) => Number(a.finished) - Number(b.finished));

  return (
    <main className="page">
      <Link href="/family" className="btn btn-text" style={{ alignSelf: 'flex-start', padding: 0 }}>Back to Family</Link>
      <h1>{isMe ? 'You' : person.display_name}</h1>

      <section className="stack" aria-label="Chores">
        <div className="row">
          <h2 className="eyebrow">{name} chores and tasks</h2>
          <span className="spacer" />
          {canGive && (
            <Link href={`/add?type=${typeId(CHORE)}&owner=${person.id}`} className="btn">
              {isMe ? 'Add one' : `Give ${person.display_name} one`}
            </Link>
          )}
        </div>
        {choreRows.length === 0 && <div className="card small">Nothing yet.</div>}
        {choreRows.map(({ o, rules, next, last, finished }) => (
          <Link key={o.id} href={`/things/${o.id}`} className="card card-link" style={finished ? { opacity: 0.7 } : undefined}>
            <span className="item-title">{o.name}{finished ? ' · done' : ''}</span>
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

      <section className="stack" aria-label="Activities and work">
        <div className="row">
          <h2 className="eyebrow">{name} activities and work</h2>
          <span className="spacer" />
          {canAddActivity && <Link href={`/add?type=${typeId(ACTIVITY)}&owner=${person.id}`} className="btn">Add</Link>}
        </div>
        {activities.length === 0 && <div className="card small">None yet.</div>}
        {sessions.map((x) => (
          <SessionCard key={`${x.slot.id}-${x.date}`} s={sessionView(w, x)} drivers={drivers} names={names} canChange={canEditActivity(w, x.object)} />
        ))}
        {activities.length > 0 && sessions.length === 0 && <div className="card small">Nothing in the next week.</div>}
        {lifts.length > 0 && (
          <div className="card stack" style={{ gap: 4 }}>
            <strong>Lifts {isMe ? 'you give' : `${person.display_name} gives`} this week</strong>
            {lifts.map((x) => (
              <span key={`${x.slot.id}-${x.date}`} style={{ fontSize: 14 }}>
                {sessionView(w, x).dateLabel} {x.startsAt}: {[x.dropOffBy === person.id ? 'drop-off' : null, x.pickUpBy === person.id ? 'pick-up' : null].filter(Boolean).join(' and ')} for {names[x.object.owner_id]} ({x.object.name})
              </span>
            ))}
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
