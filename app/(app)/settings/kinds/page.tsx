import Link from '@/components/link';
import { MoveButtons, NewKindForm } from '@/components/kinds-editor';
import { KindIcon } from '@/components/kind-icon';
import { loadWorld } from '@/lib/world';

export const metadata = { title: 'Kinds of things · Stonebook' };

export default async function Kinds() {
  const w = await loadWorld();
  if (w.me.role !== 'parent') {
    return <main className="page"><h1>Kinds of things</h1><p>Mum or Dad can add new kinds of things and their details.</p></main>;
  }
  return (
    <main className="page">
      <Link href="/settings" className="btn btn-text" style={{ alignSelf: 'flex-start', padding: 0 }}>Back to Settings</Link>
      <h1>Kinds of things</h1>
      <p className="small" style={{ margin: 0 }}>What you can add, in the order the Add page shows them. Open one to change its details.</p>
      <section className="stack" aria-label="Kinds">
        {w.types.map((t, i) => {
          const things = w.objects.filter((o) => o.object_type_id === t.id).length;
          const details = w.fields.filter((f) => f.object_type_id === t.id).length;
          return (
            <div key={t.id} className="card row" style={{ gap: 12 }}>
              <KindIcon name={t.icon} size={24} />
              <Link href={`/settings/kinds/${t.id}`} className="stack" style={{ gap: 2, flex: '1 1 auto', minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
                <span className="item-title">{t.name}{t.hidden ? <span className="badge badge-wait" style={{ marginLeft: 8 }}>Hidden</span> : null}</span>
                <span className="small">{details} {details === 1 ? 'detail' : 'details'} · {things} {things === 1 ? 'thing' : 'things'}</span>
              </Link>
              <MoveButtons table="object_types" id={t.id} first={i === 0} last={i === w.types.length - 1} />
            </div>
          );
        })}
      </section>
      <NewKindForm />
    </main>
  );
}
