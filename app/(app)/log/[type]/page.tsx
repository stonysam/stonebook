import { notFound } from 'next/navigation';
import Link from '@/components/link';
import { KindIcon } from '@/components/kind-icon';
import type { ObjectRow } from '@/lib/database.types';
import { dateText } from '@/lib/format';
import { historyOf, inLog, loadWorld, memberName } from '@/lib/world';

export const metadata = { title: 'Log · Stonebook' };

export default async function LogKind({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<{ archived?: string }> }) {
  const w = await loadWorld();
  const { type: typeId } = await params;
  const { archived } = await searchParams;
  const type = w.types.find((t) => t.id === typeId);
  if (!type) notFound();
  const showArchived = archived === '1';
  const all = w.objects.filter((o) => o.object_type_id === type.id && inLog(w, o));
  const items = all.filter((o) => (showArchived ? !!o.archived_at : !o.archived_at));
  const hasArchived = all.some((o) => o.archived_at);

  // Groups (a flock, a herd) come with their animals under them.
  const groups = type.groups ? items.filter((o) => o.is_group) : [];
  const inGroup = new Set(groups.flatMap((g) => items.filter((o) => o.parent_id === g.id).map((o) => o.id)));
  const rest = items.filter((o) => !groups.includes(o) && !inGroup.has(o.id));

  const card = (o: ObjectRow, nested = false) => {
    const last = historyOf(w, o, { logOnly: true })[0];
    return (
      <Link key={o.id} href={`/things/${o.id}`} className={`card card-link${nested ? ' log-nested' : ''}`}>
        <span className="item-title">{o.name}{o.is_group ? <span className="small" style={{ marginLeft: 8 }}>Group</span> : null}</span>
        <span className="small">{memberName(w, o.owner_id)}{o.visibility === 'private' ? ' · private' : ''}</span>
        <span style={{ fontSize: 14 }} className="muted">
          {last ? `Last: ${last.kind.toLowerCase()}, ${dateText(last.occurred_on, w.today)}` : 'Nothing logged yet'}
        </span>
      </Link>
    );
  };

  return (
    <main className="page">
      <Link href="/log" className="btn btn-text" style={{ alignSelf: 'flex-start', padding: 0 }}>Back to Log</Link>
      <div className="row">
        <span className="muted" style={{ display: 'inline-flex' }}><KindIcon name={type.icon} size={28} /></span>
        <h1 style={{ marginLeft: 10 }}>{type.name}</h1>
        <span className="spacer" />
        {w.me.role !== 'child' && <Link href={`/add?type=${type.id}`} className="btn">Add</Link>}
      </div>
      <section className="stack" aria-label={type.name}>
        {groups.map((g) => (
          <div key={g.id} className="stack" style={{ gap: 8 }}>
            {card(g)}
            {items.filter((o) => o.parent_id === g.id).map((o) => card(o, true))}
          </div>
        ))}
        {rest.map((o) => card(o))}
        {items.length === 0 && (
          <div className="card dashed" style={{ textAlign: 'center', padding: 28 }}>{showArchived ? 'Nothing archived.' : 'Nothing here yet.'}</div>
        )}
      </section>
      {(hasArchived || showArchived) && (
        <Link href={showArchived ? `/log/${type.id}` : `/log/${type.id}?archived=1`} className="btn btn-text" style={{ alignSelf: 'center' }}>
          {showArchived ? 'Back to current things' : 'Show archived things'}
        </Link>
      )}
    </main>
  );
}
