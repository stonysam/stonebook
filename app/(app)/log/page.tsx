import Link from '@/components/link';
import { KindIcon } from '@/components/kind-icon';
import { dateText } from '@/lib/format';
import { historyOf, inLog, loadWorld, memberName } from '@/lib/world';

export const metadata = { title: 'Log · Stonebook' };

export default async function Log({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const w = await loadWorld();
  const { q: raw } = await searchParams;
  const q = (raw ?? '').trim().toLowerCase();
  const logged = w.objects.filter((o) => inLog(w, o));
  const kinds = w.types
    .map((t) => ({ type: t, count: logged.filter((o) => o.object_type_id === t.id && !o.archived_at).length,
      archived: logged.some((o) => o.object_type_id === t.id && o.archived_at) }))
    .filter((k) => k.count > 0 || k.archived);

  const hits = q
    ? logged.flatMap((o) => {
        const out: { key: string; where: string; text: string; meta: string; href: string }[] = [];
        const kind = w.types.find((t) => t.id === o.object_type_id)?.name ?? '';
        if (o.name.toLowerCase().includes(q)) {
          out.push({ key: o.id, where: kind, text: o.name, meta: o.archived_at ? 'Archived' : 'Open it', href: `/things/${o.id}` });
        }
        for (const e of historyOf(w, o, { logOnly: true })) {
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
        <h1>Log</h1>
        <span className="spacer" />
        {w.me.role !== 'child' && <Link href="/add?all=1" className="btn">Add</Link>}
      </div>

      <form action="/log" className="field" role="search">
        <label htmlFor="q">Search everything, history included</label>
        <div className="row" style={{ gap: 8 }}>
          <input id="q" name="q" type="search" defaultValue={raw ?? ''} placeholder="e.g. tyres, vet, chain" enterKeyHint="search" />
          <button className="btn">Search</button>
        </div>
      </form>

      {q ? (
        <section className="stack" aria-label="Search results">
          <div className="row">
            <span className="muted">{hits.length === 0 ? `Nothing matches "${raw}"` : `${hits.length} match${hits.length === 1 ? '' : 'es'}, newest first`}</span>
            <span className="spacer" />
            <Link href="/log" className="btn btn-text">Clear</Link>
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
        <section aria-label="Kinds of things" className="log-kinds">
          {kinds.map(({ type, count }) => (
            <Link key={type.id} href={`/log/${type.id}`} className="card log-kind">
              <KindIcon name={type.icon} size={32} />
              <span className="item-title">{type.name}</span>
              <span className="small">{count} {count === 1 ? 'thing' : 'things'}</span>
            </Link>
          ))}
          {kinds.length === 0 && (
            <div className="card dashed" style={{ textAlign: 'center', padding: 28, gridColumn: '1 / -1' }}>
              Nothing in the Log yet. Add a car, an animal or a bill, and its history builds up here.
            </div>
          )}
        </section>
      )}
    </main>
  );
}
