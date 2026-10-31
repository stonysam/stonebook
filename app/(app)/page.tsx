import type { ObjectRow, RuleRow } from '@/lib/database.types';
import Link from '@/components/link';
import { Avatar, Avatars } from '@/components/avatar';
import { AbortButton, DoneButton, LogButton } from '@/components/log-button';
import { GroupParts } from '@/components/group-parts';
import { ReminderNudge } from '@/components/reminder-nudge';
import { SessionCard } from '@/components/session-card';
import { possessive, todayHeading, whenText } from '@/lib/format';
import { colorOf } from '@/lib/people';
import {
  allDue, canEditActivity, driverOptions, dueCards, groupMates, loadWorld, memberName, meterUnitFor, recentThings, sessionView, sessionsOn,
  suggestedKinds, turnsOf, typeOf, type DueRow,
} from '@/lib/world';
import { addDays } from '@/src/engine/dates';

export const metadata = { title: 'Today · Stonebook' };

/** Reminder names that just mean "do it": not worth repeating under the title, the button says it. */
const GENERIC_RULE_NAMES = ['Done', 'Do it', 'Due', 'Reminder'];

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
  // A chore that logs to an item (cleaning the coop) opens the Log sheet for that item.
  const logTarget = (o: ObjectRow, rule: RuleRow) => {
    const target = rule.logs_to ? w.objects.find((x) => x.id === rule.logs_to) : undefined;
    return target
      ? { objectId: target.id, objectName: target.name, kinds: [rule.event_kind || o.name], meterUnit: meterUnitFor(w, target.id), ruleId: rule.id, meId: me.id }
      : { objectId: o.id, objectName: o.name, kinds: suggestedKinds(w, o.id), meterUnit: meterUnitFor(w, o.id), ruleId: rule.id, turns: turnsOf(w, o.id), meId: me.id };
  };
  const plans = [w.today, addDays(w.today, 1)].flatMap((d) => sessionsOn(w, d))
    .filter((s) => view === 'family' || s.people.includes(me.id) || s.dropOffBy === me.id || s.pickUpBy === me.id);
  const { drivers, names } = driverOptions(w);

  return (
    <main className={`page${recent.length ? ' has-recent' : ''}`}>
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

      {myPendingApprovals > 0 && (
        <Link href="/approvals" className="card row dashed" style={{ textDecoration: 'none', color: 'inherit', minHeight: 56 }}>
          <span>{myPendingApprovals === 1 ? '1 chore is waiting for your OK' : `${myPendingApprovals} chores are waiting for your OK`}</span>
          <span className="spacer" />
          <strong style={{ color: 'var(--link)' }}>Review</strong>
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
        const list = dueCards(w, rows.filter((r) => r.bucket === bucket));
        if (list.length === 0) return null;
        return (
          <section key={bucket} className="stack" aria-label={title}>
            <h2 className="eyebrow">{title}</h2>
            {list.map((c) => {
              const waiting = waitingObjects.has(c.object.id);
              const mine = c.rows.find((d) => d.rule.owner_id === me.id);
              const lead = mine ?? c.rows[0];
              const group = c.people.length > 1;
              // The button follows the task: Done-style tasks get Done for anyone who sees them, Log-style get Log.
              const tapDone = lead.rule.completion === 'done' && !lead.rule.logs_to;
              const allRules = group ? [lead.rule, ...groupMates(w, lead.rule)] : [lead.rule];
              const parts = allRules.map((r) => ({ memberId: r.owner_id, ruleId: r.id, done: c.donePeople.includes(r.owner_id) }));
              const open = parts.filter((p) => !p.done);
              const mineOpen = !!mine && open.some((p) => p.ruleId === mine.rule.id);
              const othersOpen = open.filter((p) => p.ruleId !== mine?.rule.id);
              const forWhom = group ? 'Group job' : lead.rule.owner_id === me.id ? 'yours' : possessive(memberName(w, lead.rule.owner_id));
              return (
                <div key={c.key} className={`card stack stripe pc-${colorOf(w.members, lead.rule.owner_id)}`} style={{ padding: '12px 12px 12px 14px', gap: 8 }}>
                  <div className="row">
                  <Link href={`/things/${c.object.id}`} className="card-link" style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span className="item-title">{c.object.name}</span>
                    <span>
                      {!GENERIC_RULE_NAMES.includes(lead.rule.name) && <span className="muted">{lead.rule.name} · </span>}
                      <span className={c.bucket === 'overdue' ? 'overdue' : 'muted'}>
                        {c.bucket === 'setup' ? 'not started' : whenText(c.dueOn, w.today)}
                      </span>
                    </span>
                    {!group && <span className="small row" style={{ gap: 6 }}>{view === 'family' && <Avatar members={w.members} id={lead.rule.owner_id} size={18} />}{c.typeName} · {forWhom}</span>}
                  </Link>
                  <div className="stack" style={{ gap: 2, alignItems: 'flex-end', flexShrink: 0 }}>
                    {waiting ? (
                      <span className="badge badge-wait" style={{ maxWidth: 120, textAlign: 'center' }}>Waiting for Mum or Dad</span>
                    ) : me.role === 'child' ? null : tapDone ? (
                      mineOpen
                        ? <DoneButton objectId={c.object.id} ruleId={mine!.rule.id} style={{ minWidth: 72 }} />
                        : <DoneButton objectId={c.object.id} ruleIds={open.map((p) => p.ruleId)} label={group ? 'All done' : 'Done'}
                            doneLabel={group ? 'Done for everyone.' : `Done for ${memberName(w, lead.rule.owner_id)}.`} style={{ minWidth: 72 }} />
                    ) : (
                      <LogButton
                        target={logTarget(c.object, (mine ?? lead).rule)}
                        today={w.today}
                        kidName={kid ? me.display_name : null}
                        label="Log"
                        style={{ minWidth: 72 }}
                      />
                    )}
                    {group && tapDone && mineOpen && othersOpen.length > 0 && !waiting && me.role !== 'child' && (
                      <DoneButton objectId={c.object.id} ruleIds={open.map((p) => p.ruleId)} label="All done" doneLabel="Done for everyone."
                        className="btn btn-text" style={{ minHeight: 32 }} />
                    )}
                    {group && mineOpen && !waiting && me.role !== 'child' && <AbortButton objectId={c.object.id} ruleId={mine!.rule.id} />}
                  </div>
                  </div>
                  {group && (
                    <div>
                      {tapDone && me.role !== 'child' && !waiting
                        ? <GroupParts objectId={c.object.id} members={w.members} meId={me.id} parts={parts} />
                        : <span className="row" style={{ gap: 8 }}><Avatars members={w.members} ids={c.people} done={c.donePeople} /><span className="small">{c.donePeople.length} of {c.people.length} done</span></span>}
                    </div>
                  )}
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
      {recent.length > 0 && (
        <nav className="recent-bar" aria-label="Recent things">
          <div className="recent-inner">
            <span className="recent-title">Recent things</span>
            <div className="scroll-x">
              {recent.map((o) => (
                <Link key={o.id} href={`/things/${o.id}`} className="chip chip-sm">{o.name}</Link>
              ))}
            </div>
          </div>
        </nav>
      )}
    </main>
  );
}
