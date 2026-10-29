import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { FixEntry, ItemActions, StopRuleButton, StopSlotButton, VISIBILITY_LABEL } from '@/components/item-tools';
import { Avatar, Avatars } from '@/components/avatar';
import { AbortButton, DoneButton, LogButton } from '@/components/log-button';
import { CompletionSwitch, RuleOwnerSelect } from '@/components/item-tools';
import { colorOf } from '@/lib/people';
import { photoUrls } from '@/lib/photos';
import { ChoreIcon } from '@/components/chore-icons';
import { SessionCard } from '@/components/session-card';
import { dateText, possessive, whenText, WEEKDAYS } from '@/lib/format';
import { isActivity, isChore } from '@/lib/types';
import {
  canEditObject, driverOptions, historyOf, inLog, logTargets, dueFor, groupMates, loadWorld, memberName, meterUnitFor, sessionView, suggestedKinds, turnsOf, typeOf,
  upcomingSessions,
} from '@/lib/world';

export default async function ItemPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string; added?: string }>;
}) {
  const w = await loadWorld();
  const { id } = await params;
  const { kind: kindFilter, added } = await searchParams;
  const o = w.objects.find((x) => x.id === id);
  if (!o) notFound();

  const type = typeOf(w, o);
  const defs = w.fields.filter((f) => f.object_type_id === o.object_type_id);
  const values = (o.field_values ?? {}) as Record<string, unknown>;
  const rules = w.rules.filter((r) => r.object_id === o.id).map((r) => dueFor(w, r)).filter((d) => d !== null);
  const grouped = !!type?.groups;
  const inGroup = grouped && o.is_group ? w.objects.filter((x) => x.parent_id === o.id && !x.archived_at) : [];
  const parent = o.parent_id ? w.objects.find((x) => x.id === o.parent_id) : undefined;
  const groupOptions = grouped ? w.objects.filter((x) => x.object_type_id === o.object_type_id && x.is_group && !x.archived_at).map((x) => ({ id: x.id, name: x.name })) : [];
  const photoOf = (x: typeof o) => ((x.field_values ?? {}) as Record<string, unknown>).photo as string | undefined;
  const urls = grouped || defs.some((d) => d.key === 'photo') ? await photoUrls([photoOf(o), ...inGroup.map(photoOf)]) : {};
  const photo = photoOf(o) ? urls[photoOf(o)!] : undefined;
  const nameById = Object.fromEntries(inGroup.map((x) => [x.id, x.name]));
  // A group's history includes its animals' entries, so the paddock's story is in one place.
  // Things in the Log show logged entries, not one-tap Done ticks; a group includes its animals' entries.
  const logOnly = inLog(w, o);
  const history = [o, ...inGroup].flatMap((x) => historyOf(w, x, { logOnly }))
    .filter((e, i, all) => all.findIndex((x) => x.id === e.id) === i)
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at));
  const logsTo = w.rules.filter((r) => r.object_id === o.id && r.logs_to).map((r) => w.objects.find((x) => x.id === r.logs_to)).filter((x) => !!x);
  const thisYear = Number(w.today.slice(0, 4));
  const bornText = (y: unknown) => {
    const n = Number(y);
    if (!Number.isFinite(n) || !n) return null;
    const age = thisYear - n;
    return age > 0 ? `${n} (${age} ${age === 1 ? 'year' : 'years'} old)` : String(n);
  };
  const kinds = [...new Set(history.map((e) => e.kind))];
  const shown = kindFilter ? history.filter((e) => e.kind === kindFilter) : history;
  const waiting = w.pending.filter((p) => p.object_id === o.id);
  const editable = canEditObject(w, o);
  const kid = w.me.role === 'junior' || w.me.role === 'child';
  const owner = o.owner_id === w.me.id ? 'you' : memberName(w, o.owner_id);
  const activity = isActivity(type?.name);
  const myDone = rules.find((d) => d.rule.owner_id === w.me.id && d.rule.completion === 'done' && d.due.status !== 'done');
  const slots = w.slots.filter((x) => x.object_id === o.id);
  const sessions = activity ? upcomingSessions(w, o.id).slice(0, 8) : [];
  const { drivers, names } = driverOptions(w);
  const days = (ds: number[]) => ds.map((d) => WEEKDAYS[d - 1][2].slice(0, 3)).join(', ').replace(/, ([^,]*)$/, ' and $1');
  const showValue = (key: string, kindOf: string) => {
    const v = values[key];
    if (v == null || v === '') return null;
    if (Array.isArray(v)) return v.join(', ').replace(/, ([^,]*)$/, ' and $1');
    return kindOf === 'person' ? memberName(w, String(v)) : String(v);
  };

  return (
    <main className="page wide">
      <div className="split">
        <div className="main">
          <Link href={inLog(w, o) ? `/log/${o.object_type_id}` : '/'} className="btn btn-text" style={{ alignSelf: 'flex-start', padding: 0 }}>{inLog(w, o) ? `Back to ${type?.name ?? 'Log'}` : 'Back to Today'}</Link>
          <header>
            <div className="small">
              {type?.name} · {VISIBILITY_LABEL[o.visibility]} · looked after by {owner}
            </div>
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt={o.name} className="photo" style={{ width: 128, height: 128, margin: '8px 0' }} />
            )}
            <h1>{o.name}</h1>
            {parent && <Link href={`/things/${parent.id}`} className="small">Part of {parent.name}</Link>}
            {logsTo.length > 0 && <div className="small">Logged on {logsTo.map((x, i) => <span key={x!.id}>{i ? ', ' : ''}<Link href={`/things/${x!.id}`}>{x!.name}</Link></span>)}</div>}
            {o.archived_at && <p className="badge badge-wait" style={{ marginTop: 8 }}>Archived</p>}
            {added && <p className="badge badge-done" style={{ marginTop: 8 }}>Added</p>}
          </header>

          {w.me.role !== 'child' && !o.archived_at && (myDone ? (
            <div className="stack" style={{ gap: 4 }}>
              <DoneButton objectId={o.id} ruleId={myDone.rule.id} kidName={kid ? w.me.display_name : null} label="Mark done" className="btn btn-primary btn-big btn-block" />
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <LogButton
                  target={{ objectId: o.id, objectName: o.name, kinds: suggestedKinds(w, o.id), meterUnit: meterUnitFor(w, o.id), turns: turnsOf(w, o.id), ruleId: myDone.rule.id, meId: w.me.id }}
                  today={w.today} kidName={kid ? w.me.display_name : null} label="Log with a note or date" className="btn btn-text"
                />
                {groupMates(w, myDone.rule).length > 0 && <AbortButton objectId={o.id} ruleId={myDone.rule.id} />}
              </div>
            </div>
          ) : (
            <LogButton
              target={{ objectId: o.id, objectName: o.name, kinds: suggestedKinds(w, o.id), meterUnit: meterUnitFor(w, o.id), turns: turnsOf(w, o.id), meId: w.me.id }}
              today={w.today}
              kidName={kid ? w.me.display_name : null}
              label={isChore(type?.name) ? 'Mark done' : 'Log something'}
              className="btn btn-primary btn-big btn-block"
            />
          ))}

          {editable && (
            <ItemActions
              objectId={o.id} name={o.name} typeName={type?.name ?? ''} archived={!!o.archived_at}
              visibility={o.visibility}
              canPrivate={o.owner_id === w.me.id && o.created_by === w.me.id}
              defs={defs} values={values} members={w.members}
              ownerId={o.owner_id} meId={w.me.id} today={w.today} canRemind
              grouped={grouped} groups={groupOptions} isGroup={o.is_group} parentId={o.parent_id} photoUrl={photo}
              logTargets={isChore(type?.name) ? logTargets(w) : []} keepLog={o.keep_log}
            />
          )}

          {activity && (
            <section className="stack" aria-label="When it happens">
              <h2 className="eyebrow">When it happens</h2>
              {slots.length === 0 && <div className="card small">No times yet. {editable ? 'Add them with “Add times” above.' : ''}</div>}
              {slots.map((x) => (
                <div key={x.id} className="card stack" style={{ gap: 4 }}>
                  <strong>{x.on_date ? dateText(x.on_date, w.today) : `Every ${days(x.weekdays)}`}{x.starts_at ? `, ${x.starts_at.slice(0, 5)}${x.ends_at ? `–${x.ends_at.slice(0, 5)}` : ''}` : ', any time'}</strong>
                  {x.people.length > 0 && <span className="row" style={{ gap: 8 }}><Avatars members={w.members} ids={x.people} /><span className="small">{x.people.map((id) => memberName(w, id)).join(', ')}</span></span>}
                  <span className="muted" style={{ fontSize: 14 }}>
                    {[x.drop_off_by ? `Drop-off: ${names[x.drop_off_by]}` : null, x.pick_up_by ? `Pick-up: ${names[x.pick_up_by]}` : null].filter(Boolean).join(' · ') || 'No lift needed'}
                  </span>
                  {editable && <StopSlotButton slotId={x.id} />}
                </div>
              ))}
              {sessions.length > 0 && <h2 className="eyebrow">Next few times</h2>}
              {sessions.map((x) => (
                <SessionCard key={`${x.slot.id}-${x.date}`} s={sessionView(w, x)} drivers={drivers} names={names} canChange={editable} showTitle={false} />
              ))}
            </section>
          )}

          {grouped && o.is_group && (
            <section className="stack" aria-label="In this group">
              <h2 className="eyebrow">In this group{inGroup.length ? ` · ${inGroup.length}` : ''}</h2>
              {inGroup.map((x) => {
                const v = (x.field_values ?? {}) as Record<string, unknown>;
                const url = photoOf(x) ? urls[photoOf(x)!] : undefined;
                return (
                  <Link key={x.id} href={`/things/${x.id}`} className="card card-link row" style={{ gap: 12 }}>
                    {url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={url} alt="" className="photo" style={{ width: 52, height: 52 }} />
                      : <div className="photo photo-empty" style={{ width: 52, height: 52 }} aria-hidden />}
                    <div className="stack" style={{ gap: 2 }}>
                      <span className="item-title">{x.name}</span>
                      <span className="small">{[Array.isArray(v.species) ? v.species.join(', ') : v.species, bornText(v.birth_year)].filter(Boolean).join(' · ')}</span>
                    </div>
                  </Link>
                );
              })}
              {inGroup.length === 0 && <div className="card small">No animals added one by one yet. Add any that need their own history, like vet visits.</div>}
              {w.me.role !== 'child' && !o.archived_at && (
                <Link href={`/add?type=${o.object_type_id}&parent=${o.id}`} className="btn dashed" style={{ justifyContent: 'flex-start' }}>+ Add an animal to {o.name}</Link>
              )}
            </section>
          )}

          <section className="stack" aria-label="What's coming up">
            <h2 className="eyebrow">{activity ? 'Reminders' : 'What’s coming up'}</h2>
            {rules.length === 0 && <div className="card small">No reminders. {editable && !activity ? 'Add one above if it needs doing regularly.' : ''}</div>}
            {rules.map((d) => (
              <div key={d.rule.id} className={`card stack stripe pc-${colorOf(w.members, d.rule.owner_id)}`} style={{ gap: 4 }}>
                <div className="row" style={{ gap: 8 }}>
                  <Avatar members={w.members} id={d.rule.owner_id} size={22} />
                  <strong>{d.rule.name}</strong>
                  <span className="spacer" />
                  <strong className={d.bucket === 'overdue' ? 'overdue' : ''}>
                    {d.due.status === 'record' ? 'History only' : d.due.status === 'never_done' ? 'Not started' : d.due.status === 'done' ? 'Done' : whenText(d.due.dueOn, w.today)}
                  </strong>
                </div>
                <span className="muted" style={{ fontSize: 14 }}>{d.due.basis}</span>
                <span className="small">
                  {groupMates(w, d.rule).length ? `${possessive(memberName(w, d.rule.owner_id))} part of a group job` : isChore(type?.name) ? `${possessive(memberName(w, d.rule.owner_id))} turn` : `Reminds ${memberName(w, d.rule.owner_id)}`}
                </span>
                {editable && isChore(type?.name) && <RuleOwnerSelect ruleId={d.rule.id} ownerId={d.rule.owner_id} members={w.members} meId={w.me.id} />}
                {editable && d.rule.kind !== 'record' && !d.rule.logs_to && <CompletionSwitch ruleId={d.rule.id} value={d.rule.completion} />}
                {editable && <StopRuleButton ruleId={d.rule.id} />}
              </div>
            ))}
          </section>
        </div>

        <div className="side">
          <section className="stack" aria-label="Details">
            <h2 className="eyebrow">Details</h2>
            <div className="list">
              {defs.filter((d) => d.key !== 'photo' && !(grouped && (o.is_group ? d.key === 'birth_year' : d.key === 'head_count'))).map((d) => {
                const v = d.key === 'picture' && values.picture ? <ChoreIcon name={String(values.picture)} size={28} />
                  : d.key === 'birth_year' ? bornText(values.birth_year) : showValue(d.key, d.kind);
                return (
                  <div key={d.id} className="list-item" style={{ justifyContent: 'space-between' }}>
                    <span className="muted">{d.label}</span>
                    <span style={{ textAlign: 'right', whiteSpace: 'pre-wrap' }}>{v ?? <span className="small">Not set</span>}</span>
                  </div>
                );
              })}
              {defs.length === 0 && <div className="list-item small">No details for this kind of thing.</div>}
            </div>
          </section>

          <section className="stack" aria-label="History">
            <h2 className="eyebrow">History · {history.length} {history.length === 1 ? 'entry' : 'entries'}</h2>
            {kinds.length > 1 && (
              <nav className="scroll-x" aria-label="Filter history">
                <Link href={`/things/${o.id}`} className={`chip ${!kindFilter ? 'on' : ''}`} scroll={false}>All</Link>
                {kinds.map((k) => (
                  <Link key={k} href={`/things/${o.id}?kind=${encodeURIComponent(k)}`} className={`chip ${kindFilter === k ? 'on' : ''}`} scroll={false}>{k}</Link>
                ))}
              </nav>
            )}
            {waiting.map((p) => (
              <div key={p.event_id} className="card row dashed">
                <div style={{ flex: '1 1 auto' }}>
                  <div className="item-title">{p.kind}</div>
                  <div className="small">{dateText(p.occurred_on, w.today)} · {memberName(w, p.created_by)} · waiting for Mum or Dad</div>
                </div>
              </div>
            ))}
            {shown.map((e) => (
              <div key={e.id} className="card row" style={{ padding: '10px 6px 10px 16px' }}>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div className="item-title">{e.object_id !== o.id && nameById[e.object_id] ? `${nameById[e.object_id]}: ` : ''}{e.kind}</div>
                  {(e.note || e.meter_value != null) && (
                    <div style={{ fontSize: 14 }}>
                      {[e.meter_value != null ? `${e.meter_value.toLocaleString('en-GB')} ${e.meter_unit ?? ''}` : null, e.note].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <div className="small">{dateText(e.occurred_on, w.today)} · {memberName(w, e.created_by)}{e.correction_of ? ' · corrected' : ''}</div>
                </div>
                {w.me.role !== 'child' && !o.archived_at && (
                  <FixEntry eventId={e.id} objectId={e.object_id} kind={e.kind} occurredOn={e.occurred_on} note={e.note}
                    meterValue={e.meter_value} meterUnit={e.meter_unit} today={w.today} />
                )}
              </div>
            ))}
            {history.length === 0 && waiting.length === 0 && (
              <div className="card small">Nothing logged yet. {o.owner_id === w.me.id ? 'Log the last time it was done so reminders start right.' : `Log on ${possessive(memberName(w, o.owner_id))} ${o.name.toLowerCase()} when something happens.`}</div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
