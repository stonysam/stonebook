import Link from '@/components/link';
import { dateText } from '@/lib/format';
import { eventsOf, loadWorld, memberName, typeOf } from '@/lib/world';

export const metadata = { title: 'Things · Stonebook' };

type Params = { q?: string; type?: string; who?: string; archived?: string };

function href(p: Params) {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString();
  return s ? `/things?${s}` : '/things';
}

export default async function Things({ searchParams }: { searchParams: Promise<Params> }) {
  const w = await loadWorld();
  const p = await searchParams;
  const q = (p.q ?? '').trim().toLowerCase();
  const showArchived = p.archived === '1';
  const usedTypes = w.types.filter((t) => w.objects.some((o) => o.object_type_id === t.id));
  const people = w.members.filter((m) => w.objects.some((o) => o.owner_id === m.id));

  const items = w.objects
    .filter((o) => (showArchived ? !!o.archived_at : !o.archived_at))
    .filter((o) => !p.type || o.object_type_id === p.type)
    .filter((o) => !p.who || o.owner_id === p.who);

  const hits = q
    ? w.objects.flatMap((o) => {
        const out: { key: string; where: string; text: string; meta: string; href: string }[] = [];
        if (o.name.toLowerCase().includes(q)) {
          out.push({ key: o.id, where: typeOf(w, o)?.name ?? '', text: o.name, meta: o.archived_at ? 'Archived' : 'Open the item', href: `/things/${o.id}` });
        }
        for (const e of eventsOf(w, o.id)) {
          if (`${e.kind} ${e.note ?? ''}`.toLowerCase().includes(q)) {
            out.push({
              key: e.id, where: o.name, text: e.note ? `${e.kind} · ${e.note}` : e.kind,
              meta: `${dateText(e.occurred_on, w.today)} · ${memberName(w, e.created_by)}${e.meter_value != null ? ` · ${e.meter_value.toLocaleString('en-GB')} ${e.meter_unit ?? ''}` : ''}`,
              href: `/things/${o.id}`,
            });
          }
        }
        return out;
      })
    : [];

  return (
    <main className="page">
      <div className="row">
        <h1>Things</h1>
        <span className="spacer" />
        {w.me.role !== 'child' && <Link href="/add" className="btn">Add</Link>}
      </div>

      <form action="/things" className="field" role="search">
        <label htmlFor="q">Search everything, history included</label>
        <div className="row" style={{ gap: 8 }}>
          <input id="q" name="q" type="search" defaultValue={p.q ?? ''} placeholder="e.g. tyres, bulb, chain" enterKeyHint="search" />
          <button className="btn">Search</button>
        </div>
      </form>

      {q ? (
        <section className="stack" aria-label="Search results">
          <div className="row">
            <span className="muted">{hits.length === 0 ? `Nothing matches "${p.q}"` : `${hits.length} match${hits.length === 1 ? '' : 'es'}, newest first`}</span>
            <span className="spacer" />
            <Link href="/things" className="btn btn-text">Clear</Link>
          </div>
          {hits.map((h) => (
            <Link key={h.key} href={h.href} className="card card-link">
              <span className="small">{h.where}</span>
              <span className="item-title">{h.text}</span>
              <span className="muted" style={{ fontSize: 14 }}>{h.meta}</span>
            </Link>
          ))}
        </section>
      ) : (
        <>
          <nav className="scroll-x" aria-label="Kind of thing">
            <Link href={href({ who: p.who, archived: p.archived })} className={`chip ${!p.type ? 'on' : ''}`}>All</Link>
            {usedTypes.map((t) => (
              <Link key={t.id} href={href({ type: t.id, who: p.who, archived: p.archived })} className={`chip ${p.type === t.id ? 'on' : ''}`}>{t.name}</Link>
            ))}
          </nav>
          <nav className="scroll-x" aria-label="Whose">
            <Link href={href({ type: p.type, archived: p.archived })} className={`chip ${!p.who ? 'on' : ''}`}>Everyone</Link>
            {people.map((m) => (
              <Link key={m.id} href={href({ type: p.type, who: m.id, archived: p.archived })} className={`chip ${p.who === m.id ? 'on' : ''}`}>
                {m.id === w.me.id ? 'Mine' : m.display_name}
              </Link>
            ))}
          </nav>

          <section className="stack" aria-label="Things">
            {items.map((o) => {
              const last = eventsOf(w, o.id)[0];
              return (
                <Link key={o.id} href={`/things/${o.id}`} className="card card-link">
                  <span className="item-title">{o.name}</span>
                  <span className="small">
                    {typeOf(w, o)?.name} · {memberName(w, o.owner_id)}
                    {o.visibility !== 'shared' ? ` · ${o.visibility}` : ''}
                  </span>
                  <span style={{ fontSize: 14 }} className="muted">
                    {last ? `Last: ${last.kind.toLowerCase()}, ${dateText(last.occurred_on, w.today)}` : 'No history yet'}
                  </span>
                </Link>
              );
            })}
            {items.length === 0 && (
              <div className="card dashed" style={{ textAlign: 'center', padding: 28 }}>
                {w.objects.length === 0 ? 'Nothing here yet. Add the first thing from the Add tab.' : 'Nothing matches these filters.'}
              </div>
            )}
          </section>
          <Link href={href({ type: p.type, who: p.who, archived: showArchived ? undefined : '1' })} className="btn btn-text" style={{ alignSelf: 'center' }}>
            {showArchived ? 'Back to current things' : 'Show archived things'}
          </Link>
        </>
      )}
    </main>
  );
}
