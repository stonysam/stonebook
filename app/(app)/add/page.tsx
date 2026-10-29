import Link from '@/components/link';
import { AddForm } from '@/components/add-form';
import { KindIcon } from '@/components/kind-icon';
import { loadWorld, logTargets } from '@/lib/world';
import { ACTIVITY, CHORE, isActivity } from '@/lib/types';

export const metadata = { title: 'Add · Stonebook' };

export default async function Add({ searchParams }: { searchParams: Promise<{ type?: string; owner?: string; parent?: string; all?: string }> }) {
  const w = await loadWorld();
  const { type: typeId, owner, parent, all } = await searchParams;
  const type = w.types.find((t) => t.id === typeId);

  if (w.me.role === 'child') {
    return <main className="page"><h1>Add</h1><p>Ask Mum or Dad to add things for you.</p></main>;
  }

  // The Add tab: the two things added most, big and stacked. Everything else is added from the Log.
  if (!type && all !== '1') {
    const pick = (name: string) => w.types.find((t) => t.name === name);
    const big = [[pick(CHORE), 'Chore or task', 'Something to do, once or regularly'], [pick(ACTIVITY), 'Activity', 'Scouts, band, work, an appointment']] as const;
    return (
      <main className="page">
        <h1>Add</h1>
        <div className="stack" style={{ gap: 12 }}>
          {big.filter(([t]) => t).map(([t, label, hint]) => (
            <Link key={t!.id} href={`/add?type=${t!.id}${owner ? `&owner=${owner}` : ''}`} className="card add-big">
              <KindIcon name={t!.icon} size={40} />
              <span className="stack" style={{ gap: 2 }}>
                <span style={{ fontSize: 22, fontWeight: 600 }}>{label}</span>
                <span className="small">{hint}</span>
              </span>
            </Link>
          ))}
        </div>
        <p className="small" style={{ margin: 0 }}>To add a car, an animal, a bill or anything else that keeps a history, use Add in the <Link href="/log">Log</Link>.</p>
      </main>
    );
  }

  if (!type) {
    return (
      <main className="page">
        <Link href="/log" className="btn btn-text" style={{ alignSelf: 'flex-start', padding: 0 }}>Back to Log</Link>
        <h1>Add something</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 10 }}>
          {w.types.filter((t) => !t.hidden).map((t) => (
            <Link key={t.id} href={`/add?type=${t.id}${owner ? `&owner=${owner}` : ''}`} className="card"
              style={{ minHeight: 104, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', justifyContent: 'center', textAlign: 'center', textDecoration: 'none', color: 'inherit', fontWeight: 500 }}>
              <KindIcon name={t.icon} />
              {t.name}
            </Link>
          ))}
        </div>
        {w.me.role !== 'parent' && <p className="small" style={{ margin: 0 }}>You can add things for yourself, like homework or school dates, and give anyone a chore or task.</p>}
      </main>
    );
  }

  const groups = w.objects.filter((o) => o.object_type_id === type.id && o.is_group && !o.archived_at).map((o) => ({ id: o.id, name: o.name }));
  const owners = w.me.role === 'parent' || type.assignable ? w.members : w.members.filter((m) => m.id === w.me.id);
  return (
    <main className="page">
      <Link href={type.assignable || isActivity(type.name) ? '/add' : `/log/${type.id}`} className="btn btn-text" style={{ alignSelf: 'flex-start', padding: 0 }}>Back</Link>
      <h1>{type.groups ? 'New animal or group' : isActivity(type.name) ? 'New activity' : `New ${type.name.toLowerCase()}`}</h1>
      <AddForm
        typeId={type.id}
        typeName={type.name}
        defs={w.fields.filter((f) => f.object_type_id === type.id)}
        members={w.members}
        owners={owners}
        meId={w.me.id}
        isParent={w.me.role === 'parent'}
        today={w.today}
        initialOwner={owners.some((m) => m.id === owner) ? owner! : w.me.id}
        preselect={owners.some((m) => m.id === owner)}
        logTargets={type.assignable ? logTargets(w) : []}
        grouped={type.groups}
        groups={groups}
        parentId={groups.some((g) => g.id === parent) ? parent! : null}
      />
    </main>
  );
}
