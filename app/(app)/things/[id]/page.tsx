import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FixEntry, ItemActions, StopRuleButton } from '@/components/item-tools';
import { LogButton } from '@/components/log-button';
import { dateText, possessive, whenText } from '@/lib/format';
import { canEditObject, dueFor, eventsOf, loadWorld, memberName, meterUnitFor, suggestedKinds, typeOf } from '@/lib/world';

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
  const history = eventsOf(w, o.id);
  const kinds = [...new Set(history.map((e) => e.kind))];
  const shown = kindFilter ? history.filter((e) => e.kind === kindFilter) : history;
  const waiting = w.pending.filter((p) => p.object_id === o.id);
  const editable = canEditObject(w, o);
  const kid = w.me.role === 'junior' || w.me.role === 'child';
  const owner = o.owner_id === w.me.id ? 'you' : memberName(w, o.owner_id);
  const showValue = (key: string, kindOf: string) => {
    const v = values[key];
    if (v == null || v === '') return null;
    return kindOf === 'person' ? memberName(w, String(v)) : String(v);
  };

  return (
    <main className="page wide">
      <div className="split">
        <div className="main">
          <Link href="/things" className="btn btn-text" style={{ alignSelf: 'flex-start', padding: 0 }}>Back to Things</Link>
          <header>
            <div className="small">
              {type?.name} · {o.visibility === 'shared' ? 'Shared' : o.visibility === 'personal' ? (o.share_with_family ? 'Personal, shared with family' : 'Personal') : 'Private'} · looked after by {owner}
            </div>
            <h1>{o.name}</h1>
            {o.archived_at && <p className="badge badge-wait" style={{ marginTop: 8 }}>Archived</p>}
            {added && <p className="badge badge-done" style={{ marginTop: 8 }}>Added</p>}
          </header>

          {w.me.role !== 'child' && !o.archived_at && (
            <LogButton
              target={{ objectId: o.id, objectName: o.name, kinds: suggestedKinds(w, o.id), meterUnit: meterUnitFor(w, o.id) }}
              today={w.today}
              kidName={kid ? w.me.display_name : null}
              label={type?.name === 'Chore' ? 'Mark done' : 'Log something'}
              className="btn btn-primary btn-big btn-block"
            />
          )}

          {editable && (
            <ItemActions
              objectId={o.id} name={o.name} typeName={type?.name ?? ''} archived={!!o.archived_at}
              visibility={o.visibility} shareWithFamily={o.share_with_family}
              canPrivate={o.owner_id === w.me.id && o.created_by === w.me.id}
              defs={defs} values={values} members={w.members}
            />
          )}

          <section className="stack" aria-label="What's coming up">
            <h2 className="eyebrow">What&apos;s coming up</h2>
            {rules.length === 0 && <div className="card small">No reminders. {editable ? 'Add one above if it needs doing regularly.' : ''}</div>}
            {rules.map((d) => (
              <div key={d.rule.id} className="card stack" style={{ gap: 4 }}>
                <div className="row">
                  <strong>{d.rule.name}</strong>
                  <span className="spacer" />
                  <strong className={d.bucket === 'overdue' ? 'overdue' : ''}>
                    {d.due.status === 'record' ? 'History only' : d.due.status === 'never_done' ? 'Not started' : d.due.status === 'done' ? 'Done' : whenText(d.due.dueOn, w.today)}
                  </strong>
                </div>
                <span className="muted" style={{ fontSize: 14 }}>{d.due.basis}</span>
                {d.rule.owner_id !== o.owner_id && <span className="small">Reminds {memberName(w, d.rule.owner_id)}</span>}
                {editable && <StopRuleButton ruleId={d.rule.id} />}
              </div>
            ))}
          </section>
        </div>

        <div className="side">
          <section className="stack" aria-label="Details">
            <h2 className="eyebrow">Details</h2>
            <div className="list">
              {defs.map((d) => {
                const v = showValue(d.key, d.kind);
                return (
                  <div key={d.id} className="list-item" style={{ justifyContent: 'space-between' }}>
                    <span className="muted">{d.label}</span>
                    <span style={{ textAlign: 'right' }}>{v ?? <span className="small">Not set</span>}</span>
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
                  <div className="item-title">{e.kind}</div>
                  {(e.note || e.meter_value != null) && (
                    <div style={{ fontSize: 14 }}>
                      {[e.meter_value != null ? `${e.meter_value.toLocaleString('en-GB')} ${e.meter_unit ?? ''}` : null, e.note].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <div className="small">{dateText(e.occurred_on, w.today)} · {memberName(w, e.created_by)}{e.correction_of ? ' · corrected' : ''}</div>
                </div>
                {w.me.role !== 'child' && !o.archived_at && (
                  <FixEntry eventId={e.id} objectId={o.id} kind={e.kind} occurredOn={e.occurred_on} note={e.note}
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
