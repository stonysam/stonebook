import Link from '@/components/link';
import { LogButton } from '@/components/log-button';
import { ReminderNudge } from '@/components/reminder-nudge';
import { SessionCard } from '@/components/session-card';
import { possessive, todayHeading, whenText } from '@/lib/format';
import { isChore } from '@/lib/types';
import {
  allDue, canEditActivity, driverOptions, loadWorld, memberName, meterUnitFor, recentThings, sessionView, sessionsOn,
  suggestedKinds, turnsOf, typeOf, type DueRow,
} from '@/lib/world';
import { addDays } from '@/src/engine/dates';

export const metadata = { title: 'Today · Stonebook' };

const SECTIONS: [DueRow['bucket'], string][] = [
  ['overdue', 'Overdue'], ['week', 'This week'], ['month', 'This month'], ['setup', 'Waiting for a start date'],
];

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/Prague' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default async function Today({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const w = await loadWorld();
  const { me } = w;
  const kid = me.role === 'junior' || me.role === 'child';
  const view = (await searchParams).view === 'family' && !kid ? 'family' : 'mine';

  const rows = allDue(w)
    .filter((d) => d.bucket !== 'none' && d.bucket !== 'later')
    .filter((d) => view === 'family' || d.rule.owner_id === me.id)
    .sort((a, b) => (a.due.dueOn ?? '9999').localeCompare(b.due.dueOn ?? '9999'));
  const waitingObjects = new Set(w.pending.filter((p) => p.created_by === me.id).map((p) => p.object_id));
  const myPendingApprovals = me.role === 'parent' ? w.pending.length : 0;
  const recent = recentThings(w);
  const plans = [w.today, addDays(w.today, 1)].flatMap((d) => sessionsOn(w, d))
    .filter((s) => view === 'family' || s.object.owner_id === me.id || s.dropOffBy === me.id || s.pickUpBy === me.id);
  const { drivers, names } = driverOptions(w);

  return (
    <main className="page">
      <header>
        <div className="small">{todayHeading(w.today)}</div>
        <h1>{greeting()}, {me.display_name}</h1>
      </header>

      {!kid && (
        <div className="seg" role="tablist" aria-label="Whose list">
          <Link href="/" className={view === 'mine' ? 'on' : ''} aria-current={view === 'mine' ? 'page' : undefined}>Mine</Link>
          <Link href="/?view=family" className={view === 'family' ? 'on' : ''} aria-current={view === 'family' ? 'page' : undefined}>Whole family</Link>
        </div>
      )}

      {me.role !== 'child' && <ReminderNudge />}

      {recent.length > 0 && (
        <nav className="scroll-x" aria-label="Recent things">
          {recent.map((o) => (
            <Link key={o.id} href={`/things/${o.id}`} className="chip" style={{ gap: 6 }}>
              {o.name}<span className="small" style={{ fontSize: 12 }}>{typeOf(w, o)?.name.split(' ')[0]}</span>
            </Link>
          ))}
        </nav>
      )}

      {myPendingApprovals > 0 && (
        <Link href="/approvals" className="card row dashed" style={{ textDecoration: 'none', color: 'inherit', minHeight: 56 }}>
          <span>{myPendingApprovals === 1 ? '1 chore is waiting for your OK' : `${myPendingApprovals} chores are waiting for your OK`}</span>
          <span className="spacer" />
          <strong style={{ color: 'var(--green)' }}>Review</strong>
        </Link>
      )}

      {plans.length > 0 && (
        <section className="stack" aria-label="Plans">
          <h2 className="eyebrow">Today and tomorrow</h2>
          {plans.map((p) => (
            <SessionCard key={`${p.slot.id}-${p.date}`} s={sessionView(w, p)} drivers={drivers} names={names} canChange={canEditActivity(w, p.object)} />
          ))}
        </section>
      )}

      {SECTIONS.map(([bucket, title]) => {
        const list = rows.filter((r) => r.bucket === bucket);
        if (list.length === 0) return null;
        return (
          <section key={bucket} className="stack" aria-label={title}>
            <h2 className="eyebrow">{title}</h2>
            {list.map((d) => {
              const waiting = waitingObjects.has(d.object.id);
              const forWhom = d.rule.owner_id === me.id ? 'yours' : possessive(memberName(w, d.rule.owner_id));
              return (
                <div key={d.rule.id} className="card row" style={{ padding: '12px 12px 12px 16px' }}>
                  <Link href={`/things/${d.object.id}`} className="card-link" style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span className="item-title">{d.object.name}</span>
                    <span>
                      <span className="muted">{d.rule.name} · </span>
                      <span className={d.bucket === 'overdue' ? 'overdue' : 'muted'}>
                        {d.bucket === 'setup' ? 'not started' : whenText(d.due.dueOn, w.today)}
                      </span>
                    </span>
                    <span className="small">{d.typeName} · {forWhom}</span>
                  </Link>
                  {waiting ? (
                    <span className="badge badge-wait" style={{ maxWidth: 120, textAlign: 'center' }}>Waiting for Mum or Dad</span>
                  ) : me.role !== 'child' ? (
                    <LogButton
                      target={{ objectId: d.object.id, objectName: d.object.name, kinds: suggestedKinds(w, d.object.id), meterUnit: meterUnitFor(w, d.object.id),
                        ruleId: d.rule.id, turns: turnsOf(w, d.object.id), meId: me.id }}
                      today={w.today}
                      kidName={kid ? me.display_name : null}
                      label={isChore(d.typeName) ? 'Done' : 'Log'}
                      style={{ flexShrink: 0, minWidth: 72 }}
                    />
                  ) : null}
                </div>
              );
            })}
          </section>
        );
      })}

      {rows.length === 0 && plans.length === 0 && (
        <div className="card dashed" style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ margin: 0 }}>Nothing due{view === 'mine' ? ' for you' : ''}. Enjoy the day.</p>
          <p className="small" style={{ margin: '8px 0 0' }}>Add things and reminders from the Add tab.</p>
        </div>
      )}
    </main>
  );
}
