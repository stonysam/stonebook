import { notFound } from 'next/navigation';
import Link from '@/components/link';
import { AddFieldForm, FieldRow, KindControls } from '@/components/kinds-editor';
import { FIELD_KINDS, isBuiltInKind, isLockedField } from '@/lib/types';
import { loadWorld } from '@/lib/world';

export const metadata = { title: 'Kind of thing · Stonebook' };

const kindLabel = (kind: string, key: string) =>
  key === 'photo' ? 'A photo' : (FIELD_KINDS.find(([k]) => k === kind)?.[1] ?? kind);

export default async function Kind({ params }: { params: Promise<{ id: string }> }) {
  const w = await loadWorld();
  const { id } = await params;
  const type = w.types.find((t) => t.id === id);
  if (!type) notFound();
  if (w.me.role !== 'parent') {
    return <main className="page"><h1>{type.name}</h1><p>Mum or Dad can change kinds of things.</p></main>;
  }
  const fields = w.fields.filter((f) => f.object_type_id === type.id);
  const things = w.objects.filter((o) => o.object_type_id === type.id).length;
  return (
    <main className="page">
      <Link href="/settings/kinds" className="btn btn-text" style={{ alignSelf: 'flex-start', padding: 0 }}>Back to Kinds of things</Link>
      <header>
        <div className="small">{things} {things === 1 ? 'thing' : 'things'} of this kind{type.hidden ? ' · hidden from Add' : ''}</div>
        <h1>{type.name}</h1>
      </header>
      <KindControls id={type.id} name={type.name} builtIn={isBuiltInKind(type.name)} hidden={type.hidden} />

      <section className="stack" aria-label="Details">
        <h2 className="eyebrow">Details · asked when adding, in this order</h2>
        {fields.length === 0 && <div className="card small">No details yet. Every thing still has a name, who looks after it, reminders and history.</div>}
        {fields.map((f, i) => (
          <FieldRow key={f.id}
            field={{ id: f.id, label: f.label, kind: f.kind, options: Array.isArray(f.options) ? (f.options as string[]) : null, multiple: f.multiple, required: f.required, key: f.key }}
            kindLabel={kindLabel(f.kind, f.key)} locked={isLockedField(type.name, f.key)}
            first={i === 0} last={i === fields.length - 1} />
        ))}
      </section>
      <AddFieldForm typeId={type.id} hasThings={things > 0} hasPhoto={fields.some((f) => f.key === 'photo')} />
    </main>
  );
}
