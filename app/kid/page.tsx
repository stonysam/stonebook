import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { KidScreen } from '@/components/kid-screen';
import { KID_COOKIE } from '@/lib/kid';
import { kidToday, loadWorld } from '@/lib/world';

export const metadata = { title: 'Stonebook' };

/** Benji mode: the family tablet locked to one child's chores. */
export default async function KidPage() {
  const childId = (await cookies()).get(KID_COOKIE)?.value;
  if (!childId) redirect('/');
  const w = await loadWorld();
  const child = w.members.find((m) => m.id === childId && m.role === 'child');
  if (!child) redirect('/');
  const { chores, starsThisWeek } = kidToday(w, child.id);
  return (
    <KidScreen
      childId={child.id}
      name={child.display_name}
      stars={starsThisWeek}
      tiles={chores.map((c) => ({ ruleId: c.rule.id, objectId: c.object.id, name: c.object.name, picture: c.picture, state: c.state }))}
    />
  );
}
