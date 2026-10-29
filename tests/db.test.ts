// Runs the real migration against Postgres (PGlite, in-process) and checks the
// security rules by signing in as each family member.
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const sql = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

const id = {
  sam:    '00000000-0000-4000-8000-000000000001',
  crystal:'00000000-0000-4000-8000-000000000002',
  eldest: '00000000-0000-4000-8000-000000000021',
  second: '00000000-0000-4000-8000-000000000017',
  junior: '00000000-0000-4000-8000-000000000014',
  child:  '00000000-0000-4000-8000-000000000007',
};
// Auth user ids (what Google sign-in gives Supabase), deliberately different from member ids
const authId = {
  sam: 'aaaaaaaa-0000-4000-8000-000000000001',
  crystal: 'aaaaaaaa-0000-4000-8000-000000000002',
  eldest: 'aaaaaaaa-0000-4000-8000-000000000021',
  second: 'aaaaaaaa-0000-4000-8000-000000000017',
  junior: 'aaaaaaaa-0000-4000-8000-000000000014',
  stranger: 'aaaaaaaa-0000-4000-8000-0000000000ff',
  late: 'aaaaaaaa-0000-4000-8000-0000000000aa',
};

let db: PGlite;
let typeId: Record<string, string>;

async function as<T>(who: keyof typeof authId, fn: () => Promise<T>, email = `${who}@example.com`, provider = 'google'): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
    [authId[who], JSON.stringify({ sub: authId[who], email, app_metadata: { provider } })]);
  await db.exec('set role authenticated');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

const rows = async (q: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(q, params)).rows;
const names = async (q: string, params: unknown[] = []) => (await rows(q, params)).map((r) => r.name).sort();

async function addObject(o: { name: string; type: string; owner: string; visibility?: string; share?: boolean; fields?: object; group?: boolean; parent?: string }) {
  const r = await rows(
    `insert into objects (object_type_id, name, owner_id, visibility, share_with_family, field_values, is_group, parent_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [typeId[o.type], o.name, o.owner, o.visibility ?? 'shared', o.share ?? false, JSON.stringify(o.fields ?? {}), o.group ?? false, o.parent ?? null]);
  return r[0].id as string;
}

let car: string, crystalPassport: string, eldestPassport: string, secondInsurance: string, eldestDiary: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql('./supabase-auth-stub.sql'));
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const f of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
    const text = readFileSync(new URL(f, migrations), 'utf8');
    if (text.startsWith('-- live-only')) continue; // pg_cron, pg_net, Vault: Supabase only
    await db.exec(text);
  }
  await db.exec(sql('../supabase/seed.sql'));

  typeId = Object.fromEntries((await rows('select id, name from object_types')).map((r) => [r.name, r.id]));

  // Allow-list. Kids' and parents' accounts are claimed on first sign-in (tested below), except Sam's.
  await db.query(`insert into members (id, display_name, role, email, auth_user_id) values
    ($1, 'Sam', 'parent', 'sam@example.com', $7),
    ($2, 'Crystal', 'parent', 'crystal@example.com', null),
    ($3, 'Eldest', 'member', 'eldest@example.com', null),
    ($4, 'Second', 'member', 'second@example.com', null),
    ($5, 'Junior', 'junior', 'junior@example.com', null),
    ($6, 'Youngest', 'child', null, null)`,
    [id.sam, id.crystal, id.eldest, id.second, id.junior, id.child, authId.sam]);
  for (const who of ['crystal', 'eldest', 'second', 'junior'] as const) {
    await as(who, () => db.query('select app.claim_membership()'));
  }

  car = await addObject({ name: 'Škoda Octavia', type: 'Vehicle', owner: id.sam, fields: { fuel: 'Diesel', plate: '1C2 3456' } });
  await addObject({ name: 'Sheep flock', type: 'Animal or flock', owner: id.crystal, fields: { species: 'Sheep', head_count: 24 } });
  crystalPassport = await addObject({ name: "Crystal's passport", type: 'Document', owner: id.crystal, visibility: 'personal', fields: { doc_type: 'Passport' } });
  eldestPassport = await addObject({ name: "Eldest's passport", type: 'Document', owner: id.eldest, visibility: 'personal', fields: { doc_type: 'Passport' } });
  secondInsurance = await addObject({ name: "Second's insurance card", type: 'Document', owner: id.second, visibility: 'personal', share: true, fields: { doc_type: 'Health insurance card' } });
  eldestDiary = await as('eldest', () => addObject({ name: 'Uni deadlines', type: 'Chore or task', owner: id.eldest, visibility: 'private' }));
});

describe('sign-in and the allow-list', () => {
  it('links a Google account to its member by email', async () => {
    const r = await rows('select auth_user_id from members where id = $1', [id.crystal]);
    expect(r[0].auth_user_id).toBe(authId.crystal);
  });

  it('no signed-in user can read child PIN hashes, parents included', async () => {
    await db.query(`insert into member_pins (member_id, pin_hash) values ($1, 'hash')`, [id.child]);
    await expect(as('sam', () => rows('select * from member_pins'))).rejects.toThrow(/permission denied/);
    await expect(as('junior', () => db.query(`insert into member_pins (member_id, pin_hash) values ($1, 'x')`, [id.junior])))
      .rejects.toThrow();
  });

  it('only a Google sign-in can claim a place on the list', async () => {
    const [m] = await rows(`insert into members (display_name, role, email) values ('Late', 'member', 'late@example.com') returning id`);
    const viaEmail = await as('late', () => rows('select app.claim_membership() as m'), 'late@example.com', 'email');
    expect(viaEmail[0].m).toBeNull();
    expect(await as('late', () => rows('select * from members'), 'late@example.com', 'email')).toEqual([]);
    const viaGoogle = await as('late', () => rows('select app.claim_membership() as m'), 'late@example.com');
    expect(viaGoogle[0].m).toBe(m.id);
  });

  it('an email that is not on the list gets nothing', async () => {
    const claimed = await as('stranger', () => rows('select app.claim_membership() as m'), 'stranger@example.com');
    expect(claimed[0].m).toBeNull();
    expect(await as('stranger', () => names('select name from objects'), 'stranger@example.com')).toEqual([]);
    expect(await as('stranger', () => rows('select * from members'), 'stranger@example.com')).toEqual([]);
  });
});

describe('who sees what', () => {
  it('parents see everything except other people\'s private items', async () => {
    const seen = await as('crystal', () => names('select name from objects'));
    expect(seen).toEqual(["Crystal's passport", "Eldest's passport", "Second's insurance card", 'Sheep flock', 'Škoda Octavia']);
    expect(seen).not.toContain('Uni deadlines');
  });

  it('a member sees shared items, their own, and siblings\' items switched to share with family', async () => {
    const seen = await as('eldest', () => names('select name from objects'));
    expect(seen).toEqual(["Eldest's passport", "Second's insurance card", 'Sheep flock', 'Uni deadlines', 'Škoda Octavia']);
  });

  it('a sibling\'s personal item stays hidden unless shared', async () => {
    const seen = await as('second', () => names('select name from objects'));
    expect(seen).not.toContain("Eldest's passport");
    expect(seen).not.toContain("Crystal's passport");
    expect(seen).not.toContain('Uni deadlines');
  });

  it('history is visible only with its object', async () => {
    await as('eldest', () => db.query(
      `insert into events (object_id, kind, occurred_on, created_by) values ($1, 'deadline met', '2026-10-17', $2)`,
      [eldestDiary, id.eldest]));
    expect(await as('crystal', () => rows('select * from events where object_id = $1', [eldestDiary]))).toEqual([]);
    expect(await as('crystal', () => rows('select * from effective_events where object_id = $1', [eldestDiary]))).toEqual([]);
    expect((await as('eldest', () => rows('select * from events where object_id = $1', [eldestDiary]))).length).toBe(1);
  });
});

describe('private items', () => {
  it('the 14-year-old can add their own private homework item that parents cannot see', async () => {
    await as('junior', () => addObject({ name: 'Maths homework', type: 'Chore or task', owner: id.junior, visibility: 'private' }));
    expect(await as('junior', () => names('select name from objects where owner_id = $1', [id.junior]))).toEqual(['Maths homework']);
    expect(await as('sam', () => names('select name from objects where owner_id = $1', [id.junior]))).toEqual([]);
  });

  it('nobody can create an item for someone else, except parents and chores or tasks (and never a private one)', async () => {
    await expect(as('junior', () => addObject({ name: 'x', type: 'Vehicle', owner: id.eldest }))).rejects.toThrow(/row-level security/);
    await expect(as('junior', () => addObject({ name: 'x', type: 'Chore or task', owner: id.eldest, visibility: 'personal' }))).rejects.toThrow(/row-level security/);
    await expect(as('sam', () => addObject({ name: 'y', type: 'Chore or task', owner: id.junior, visibility: 'private' }))).rejects.toThrow(/row-level security/);
    await expect(as('sam', () => addObject({ name: 'Feed chickens', type: 'Chore or task', owner: id.junior }))).resolves.toBeTruthy();
  });

  it('a parent cannot switch someone else\'s item to private, or touch a private one', async () => {
    await expect(as('sam', () => db.query(`update objects set visibility = 'private' where id = $1`, [eldestPassport]))).rejects.toThrow(/row-level security/);
    const touched = await as('sam', () => db.query(`update objects set name = 'renamed' where id = $1`, [eldestDiary]));
    expect(touched.affectedRows).toBe(0);
  });

  it('someone who created an item can make it private and back', async () => {
    const licence = await as('eldest', () => addObject({ name: 'Driving licence', type: 'Document', owner: id.eldest, visibility: 'personal', fields: { doc_type: 'Driving licence' } }));
    await as('eldest', () => db.query(`update objects set visibility = 'private' where id = $1`, [licence]));
    expect(await as('crystal', () => names('select name from objects where id = $1', [licence]))).toEqual([]);
    await as('eldest', () => db.query(`update objects set visibility = 'personal' where id = $1`, [licence]));
    expect(await as('crystal', () => names('select name from objects where id = $1', [licence]))).toEqual(['Driving licence']);
  });

  it('an item a parent entered for a kid cannot be made private by the kid', async () => {
    await expect(as('eldest', () => db.query(`update objects set visibility = 'private' where id = $1`, [eldestPassport])))
      .rejects.toThrow(/row-level security/);
  });

  it('a chore a parent assigned cannot be hidden from parents', async () => {
    const chore = await as('crystal', () => addObject({ name: 'Muck out the shed', type: 'Chore or task', owner: id.junior }));
    await expect(as('junior', () => db.query(`update objects set visibility = 'private' where id = $1`, [chore])))
      .rejects.toThrow(/row-level security/);
    // and the app can't fake who created it
    await expect(as('junior', () => db.query(`update objects set created_by = $1, visibility = 'private' where id = $2`, [id.junior, chore])))
      .rejects.toThrow(/row-level security/);
    expect(await as('crystal', () => names('select name from objects where id = $1', [chore]))).toEqual(['Muck out the shed']);
  });

  it('a member cannot hand their item to someone else', async () => {
    await expect(as('eldest', () => db.query('update objects set owner_id = $1 where id = $2', [id.second, eldestPassport]))).rejects.toThrow(/row-level security/);
  });
});

describe('logging events', () => {
  it('the 14-year-old can log on shared farm items but not edit them', async () => {
    await as('junior', () => db.query(
      `insert into events (object_id, kind, occurred_on, created_by) values ($1, 'washed', '2026-10-18', $2)`, [car, id.junior]));
    const r = await as('junior', () => db.query(`update objects set name = 'mine now' where id = $1`, [car]));
    expect(r.affectedRows).toBe(0);
  });

  it('nobody can log on an item they cannot see, or as someone else', async () => {
    await expect(as('junior', () => db.query(
      `insert into events (object_id, kind, occurred_on, created_by) values ($1, 'renewed', '2026-10-18', $2)`,
      [crystalPassport, id.junior]))).rejects.toThrow(/row-level security/);
    await expect(as('junior', () => db.query(
      `insert into events (object_id, kind, occurred_on, created_by) values ($1, 'washed', '2026-10-18', $2)`,
      [car, id.sam]))).rejects.toThrow(/row-level security/);
  });

  it('events are append-only, even for the database owner', async () => {
    const [e] = await as('sam', () => rows(
      `insert into events (object_id, kind, occurred_on, meter_value, meter_unit, created_by)
       values ($1, 'oil change', '2026-03-14', 182400, 'km', $2) returning id`, [car, id.sam]));
    await expect(db.query('update events set occurred_on = $1 where id = $2', ['2026-03-15', e.id])).rejects.toThrow(/append-only/);
    await expect(db.query('delete from events where id = $1', [e.id])).rejects.toThrow(/append-only/);

    // The way to fix a mistake is a correction, and only the corrected entry counts.
    await as('sam', () => db.query(
      `insert into events (object_id, kind, occurred_on, meter_value, meter_unit, correction_of, created_by)
       values ($1, 'oil change', '2026-03-15', 182400, 'km', $2, $3)`, [car, e.id, id.sam]));
    const effective = await as('sam', () => rows(
      `select occurred_on::text from effective_events where object_id = $1 and kind = 'oil change'`, [car]));
    expect(effective).toEqual([{ occurred_on: '2026-03-15' }]);
  });

  it('a correction must belong to the same object', async () => {
    const [e] = await as('sam', () => rows(
      `insert into events (object_id, kind, occurred_on, created_by) values ($1, 'tyres changed', '2026-10-01', $2) returning id`, [car, id.sam]));
    await expect(as('crystal', () => db.query(
      `insert into events (object_id, kind, occurred_on, correction_of, created_by) values ($1, 'x', '2026-10-01', $2, $3)`,
      [crystalPassport, e.id, id.crystal]))).rejects.toThrow(/same object/);
  });
});

describe('parents edit kinds of things', () => {
  it('counts and removes a detail across everyone’s things, private ones included', async () => {
    const cabin = (await as('sam', () => rows(`insert into object_types (name, sort_order) values ('Cabin', 200) returning id`)))[0].id;
    typeId.Cabin = cabin as string;
    const sleeps = (await as('sam', () => rows(`insert into field_defs (object_type_id, key, label, kind) values ($1, 'sleeps', 'Sleeps', 'number') returning id`, [cabin])))[0].id;
    const size = (await as('sam', () => rows(`insert into field_defs (object_type_id, key, label, kind, options, multiple) values ($1, 'beds', 'Beds', 'choice', '["Single","Double"]', true) returning id`, [cabin])))[0].id;
    await as('crystal', () => addObject({ name: 'Crystal’s den', type: 'Cabin', owner: id.crystal, visibility: 'private', fields: { sleeps: 2, beds: ['Double'] } }));
    await as('sam', () => addObject({ name: 'Forest cabin', type: 'Cabin', owner: id.sam, fields: { sleeps: 4 } }));
    expect((await as('sam', () => rows('select public.kind_usage($1) n', [cabin])))[0].n).toBe(2);
    expect((await as('sam', () => rows('select public.field_usage($1, $2) n', [size, 'Double'])))[0].n).toBe(1);
    expect((await as('sam', () => rows('select public.field_usage($1, $2) n', [size, 'Single'])))[0].n).toBe(0);
    await expect(as('eldest', () => rows('select public.remove_field($1)', [sleeps]))).rejects.toThrow(/Only Mum or Dad/);
    await expect(as('eldest', () => rows(`insert into field_defs (object_type_id, key, label, kind) values ($1, 'x', 'X', 'text')`, [cabin]))).rejects.toThrow(/row-level security/);
    expect((await as('sam', () => rows('select public.remove_field($1) n', [sleeps])))[0].n).toBe(2);
    const left = await rows(`select field_values from objects where object_type_id = $1`, [cabin]);
    expect(left.every((r) => !('sleeps' in (r.field_values as object)))).toBe(true);
    await expect(as('sam', () => rows(`delete from object_types where id = $1`, [cabin]))).rejects.toThrow(/foreign key/);
  });

  it('keeps details the app relies on', async () => {
    const pic = (await rows(`select f.id from field_defs f join object_types t on t.id = f.object_type_id where t.name = 'Chore or task' and f.key = 'picture'`))[0].id;
    await expect(as('sam', () => rows('select public.remove_field($1)', [pic]))).rejects.toThrow(/relies on/);
  });
});

describe('animals one by one, in groups', () => {
  it('puts an animal in one group, never a group in a group or an animal in an animal', async () => {
    const paddock = await as('sam', () => addObject({ name: 'Horses and Clyde', type: 'Animal or flock', owner: id.sam, group: true, fields: { species: ['Horse', 'Donkey'], head_count: 6 } }));
    const clyde = await as('sam', () => addObject({ name: 'Clyde', type: 'Animal or flock', owner: id.sam, parent: paddock, fields: { species: ['Donkey'], birth_year: 2014 } }));
    expect((await rows('select parent_id from objects where id = $1', [clyde]))[0].parent_id).toBe(paddock);
    await expect(as('sam', () => addObject({ name: 'Foal', type: 'Animal or flock', owner: id.sam, parent: clyde, fields: { species: 'Horse' } }))).rejects.toThrow(/group of the same kind/);
    await expect(as('sam', () => addObject({ name: 'Herd', type: 'Animal or flock', owner: id.sam, group: true, parent: paddock, fields: { species: 'Horse' } }))).rejects.toThrow(/group can't be part of another group/);
    await expect(as('sam', () => addObject({ name: 'Tractor', type: 'Machine', owner: id.sam, parent: paddock }))).rejects.toThrow(/group of the same kind/);
    await expect(as('sam', () => rows('update objects set is_group = false where id = $1', [paddock]))).rejects.toThrow(/still has members/);
  });
});

describe('fields are checked against the object type', () => {
  it('rejects unknown fields, wrong types, bad choices and missing required fields', async () => {
    await expect(as('sam', () => addObject({ name: 'a', type: 'Vehicle', owner: id.sam, fields: { colour: 'red' } }))).rejects.toThrow(/Unknown field/);
    await expect(as('sam', () => addObject({ name: 'b', type: 'Vehicle', owner: id.sam, fields: { fuel: 'Steam' } }))).rejects.toThrow(/must be one of/);
    await expect(as('sam', () => addObject({ name: 'c', type: 'Animal or flock', owner: id.sam, fields: { head_count: 3 } }))).rejects.toThrow(/Species is required/);
    await expect(as('sam', () => addObject({ name: 'd', type: 'Animal or flock', owner: id.sam, fields: { species: 'Goat', head_count: 'three' } }))).rejects.toThrow(/must be a number/);
    await expect(as('sam', () => addObject({ name: 'e', type: 'Document', owner: id.sam, fields: { doc_type: 'Passport', holder: id.eldest } }))).resolves.toBeTruthy();
    await expect(as('sam', () => addObject({ name: 'f', type: 'Document', owner: id.sam, fields: { doc_type: 'Passport', holder: 'nobody' } }))).rejects.toThrow(/family member/);
  });

  it('lets an animal group be several species, from the list only', async () => {
    await expect(as('sam', () => addObject({ name: 'Poultry', type: 'Animal or flock', owner: id.sam, fields: { species: ['Chicken', 'Duck'] } }))).resolves.toBeTruthy();
    await expect(as('sam', () => addObject({ name: 'Paddock', type: 'Animal or flock', owner: id.sam, fields: { species: ['Horse', 'Donkey'] } }))).resolves.toBeTruthy();
    await expect(as('sam', () => addObject({ name: 'g', type: 'Animal or flock', owner: id.sam, fields: { species: ['Chicken', 'Dragon'] } }))).rejects.toThrow(/one or more of/);
    await expect(as('sam', () => addObject({ name: 'h', type: 'Animal or flock', owner: id.sam, fields: { species: [] } }))).rejects.toThrow(/one or more of/);
    await expect(as('sam', () => addObject({ name: 'i', type: 'Vehicle', owner: id.sam, fields: { fuel: ['Diesel', 'Petrol'] } }))).rejects.toThrow(/must be one of/);
  });
});

describe('rules', () => {
  it('parents add rules to shared items; members only to their own', async () => {
    const add = (objectId: string, owner: string) => db.query(
      `insert into rules (object_id, name, kind, event_kind, every_months, meter_every, meter_unit, owner_id)
       values ($1, 'Oil', 'interval', 'oil change', 12, 15000, 'km', $2)`, [objectId, owner]);
    await expect(as('sam', () => add(car, id.sam))).resolves.toBeTruthy();
    await expect(as('eldest', () => add(car, id.eldest))).rejects.toThrow(/row-level security/);
    await expect(as('eldest', () => db.query(
      `insert into rules (object_id, name, kind, event_kind, due_on, owner_id) values ($1, 'Expiry', 'fixed_date', 'renewed', '2030-01-01', $2)`,
      [eldestPassport, id.eldest]))).resolves.toBeTruthy();
  });

  it('a rule cannot be attached to an item you cannot see', async () => {
    await expect(as('sam', () => db.query(
      `insert into rules (object_id, name, kind, event_kind, every_days, owner_id) values ($1, 'x', 'interval', 'x', 7, $2)`,
      [eldestDiary, id.sam]))).rejects.toThrow(/row-level security/);
  });

  it('rejects malformed rules', async () => {
    await expect(as('sam', () => db.query(
      `insert into rules (object_id, name, kind, event_kind, owner_id) values ($1, 'x', 'interval', 'x', $2)`, [car, id.sam])))
      .rejects.toThrow(/interval_shape/);
  });
});

describe('kids\' chores wait for a parent', () => {
  const log = (who: keyof typeof authId, memberId: string, objectId: string, extra = '') =>
    as(who, () => rows(
      `insert into events (object_id, kind, occurred_on, created_by${extra ? ', needs_confirmation' : ''})
       values ($1, 'done', '2026-10-18', $2${extra ? ', false' : ''}) returning id, needs_confirmation`,
      [objectId, memberId]));
  const decide = (who: keyof typeof authId, memberId: string, eventId: string, approved: boolean) =>
    as(who, () => db.query(`insert into confirmations (event_id, approved, decided_by) values ($1, $2, $3)`, [eventId, approved, memberId]));

  let hens: string;
  beforeAll(async () => {
    hens = await as('sam', () => addObject({ name: 'Feed the hens', type: 'Chore or task', owner: id.junior }));
  });

  it('the 14-year-old\'s chore waits, and the app cannot skip the wait', async () => {
    const [e] = await log('junior', id.junior, hens, 'try to skip');
    expect(e.needs_confirmation).toBe(true);
    expect(await as('crystal', () => rows('select * from effective_events where id = $1', [e.id]))).toEqual([]);
    expect((await as('crystal', () => rows('select assigned_by from awaiting_confirmation where event_id = $1', [e.id]))))
      .toEqual([{ assigned_by: id.sam }]);
    expect((await as('junior', () => rows('select * from awaiting_confirmation where event_id = $1', [e.id]))).length).toBe(1);
    expect(await as('eldest', () => rows('select * from family_feed where event_id = $1', [e.id]))).toEqual([]);
  });

  it('17 and 21 count straight away, and so do a kid\'s own chores', async () => {
    const [byMember] = await log('eldest', id.eldest, hens);
    expect(byMember.needs_confirmation).toBe(false);
    const own = await as('junior', () => addObject({ name: 'Tidy my desk', type: 'Chore or task', owner: id.junior }));
    const [byJunior] = await log('junior', id.junior, own);
    expect(byJunior.needs_confirmation).toBe(false);
  });

  it('only a parent can decide, and the decision is final', async () => {
    const [e] = await log('junior', id.junior, hens);
    await expect(decide('junior', id.junior, e.id as string, true)).rejects.toThrow(/row-level security/);
    await expect(decide('eldest', id.eldest, e.id as string, true)).rejects.toThrow(/row-level security/);
    await expect(decide('crystal', id.sam, e.id as string, true)).rejects.toThrow(/row-level security/);
    await decide('crystal', id.crystal, e.id as string, true);
    await expect(decide('sam', id.sam, e.id as string, false)).rejects.toThrow(/duplicate key/);
    await expect(as('sam', () => db.query('update confirmations set approved = false where event_id = $1', [e.id])))
      .rejects.toThrow(/permission denied/);

    expect((await as('sam', () => rows('select * from effective_events where id = $1', [e.id]))).length).toBe(1);
    expect(await as('sam', () => rows('select * from awaiting_confirmation where event_id = $1', [e.id]))).toEqual([]);
    const [k] = await rows('select decided_at from confirmations where event_id = $1', [e.id]);
    const [f] = await as('eldest', () => rows('select announced_at from family_feed where event_id = $1', [e.id]));
    expect(f.announced_at).toEqual(k.decided_at);
  });

  it('a refused chore never counts', async () => {
    const [e] = await log('junior', id.junior, hens);
    await decide('sam', id.sam, e.id as string, false);
    expect(await as('sam', () => rows('select * from effective_events where id = $1', [e.id]))).toEqual([]);
    expect(await as('sam', () => rows('select * from awaiting_confirmation where event_id = $1', [e.id]))).toEqual([]);
  });

  it('entries that don\'t need a parent can\'t be "confirmed"', async () => {
    const [e] = await log('eldest', id.eldest, hens);
    await expect(decide('sam', id.sam, e.id as string, true)).rejects.toThrow(/row-level security/);
  });
});

describe('family feed and reactions', () => {
  const react = (who: keyof typeof authId, memberId: string, eventId: string, emoji: string) =>
    as(who, () => db.query(`insert into reactions (event_id, member_id, emoji) values ($1, $2, $3)`, [eventId, memberId, emoji]));
  const feed = (who: keyof typeof authId) => as(who, () => rows('select * from family_feed'));

  let tractor: string, service: string;
  beforeAll(async () => {
    tractor = await addObject({ name: 'Zetor', type: 'Machine', owner: id.sam });
    [{ id: service }] = (await as('sam', () => rows(
      `insert into events (object_id, kind, occurred_on, created_by) values ($1, 'serviced', '2026-10-18', $2) returning id`,
      [tractor, id.sam]))) as { id: string }[];
  });

  it('shows what got done on whole-family items, not personal or private ones', async () => {
    const [passportRenewal] = await as('crystal', () => rows(
      `insert into events (object_id, kind, occurred_on, created_by) values ($1, 'renewed', '2026-10-18', $2) returning id`,
      [crystalPassport, id.crystal]));
    const [siblingShared] = await as('second', () => rows(
      `insert into events (object_id, kind, occurred_on, created_by) values ($1, 'renewed', '2026-10-18', $2) returning id`,
      [secondInsurance, id.second]));
    const seen = (await feed('eldest')).map((r) => r.event_id);
    expect(seen).toContain(service);
    expect(seen).toContain(siblingShared.id);
    expect((await feed('sam')).map((r) => r.event_id)).not.toContain(passportRenewal.id);
    expect((await feed('crystal')).map((r) => r.object_name)).not.toContain('Uni deadlines');
  });

  it('anyone with a login can react with one of the six; nobody else can sign for them', async () => {
    await react('eldest', id.eldest, service, 'clap');
    await react('junior', id.junior, service, 'wolf');
    await expect(react('junior', id.junior, service, 'thumbsdown')).rejects.toThrow(/check constraint/);
    await expect(react('junior', id.eldest, service, 'fire')).rejects.toThrow(/row-level security/);
    await expect(react('stranger', id.eldest, service, 'fire')).rejects.toThrow(/row-level security/);
    const [item] = (await feed('crystal')).filter((r) => r.event_id === service);
    expect(item.reactions).toEqual([{ emoji: 'clap', member_id: id.eldest }, { emoji: 'wolf', member_id: id.junior }]);
  });

  it('no reacting to items outside the feed', async () => {
    const [e] = await as('crystal', () => rows(
      `insert into events (object_id, kind, occurred_on, created_by) values ($1, 'checked', '2026-10-18', $2) returning id`,
      [crystalPassport, id.crystal]));
    await expect(react('sam', id.sam, e.id as string, 'heart')).rejects.toThrow(/row-level security/);
  });

  it('people can take back their own reaction, not someone else\'s', async () => {
    await react('sam', id.sam, service, 'star');
    const other = await as('junior', () => db.query(`delete from reactions where event_id = $1 and member_id = $2`, [service, id.sam]));
    expect(other.affectedRows).toBe(0);
    const own = await as('sam', () => db.query(`delete from reactions where event_id = $1 and member_id = $2`, [service, id.sam]));
    expect(own.affectedRows).toBe(1);
  });

  it('a correction keeps its reactions and isn\'t announced twice', async () => {
    const [before] = (await feed('eldest')).filter((r) => r.event_id === service);
    const [fix] = await as('sam', () => rows(
      `insert into events (object_id, kind, occurred_on, correction_of, created_by)
       values ($1, 'serviced', '2026-10-17', $2, $3) returning id, root_id`, [tractor, service, id.sam]));
    expect(fix.root_id).toBe(service);
    const items = (await feed('eldest')).filter((r) => r.id === service);
    expect(items).toHaveLength(1);
    expect(items[0].event_id).toBe(fix.id);
    expect(items[0].announced_at).toEqual(before.announced_at);
    expect(items[0].reactions).toEqual(before.reactions);
  });

  it('strangers see no feed', async () => {
    expect(await as('stranger', () => rows('select * from family_feed'), 'stranger@example.com')).toEqual([]);
  });

  it('each person keeps their own "last seen" for the badge', async () => {
    await as('eldest', () => db.query(`insert into feed_seen (member_id) values ($1)`, [id.eldest]));
    await as('eldest', () => db.query(`update feed_seen set seen_at = now() where member_id = $1`, [id.eldest]));
    await expect(as('eldest', () => db.query(`insert into feed_seen (member_id) values ($1)`, [id.junior])))
      .rejects.toThrow(/row-level security/);
    expect(await as('junior', () => rows('select * from feed_seen'))).toEqual([]);
  });
});

describe('weekly rules', () => {
  it('a chore on set days needs valid weekdays', async () => {
    const chore = await as('sam', () => addObject({ name: 'Collect the eggs', type: 'Chore or task', owner: id.second }));
    const add = (days: string | null) => as('sam', () => db.query(
      `insert into rules (object_id, name, kind, event_kind, weekdays, owner_id) values ($1, 'Eggs', 'weekly', 'done', $2::smallint[], $3)`,
      [chore, days, id.second]));
    await expect(add('{2,5}')).resolves.toBeTruthy();
    await expect(add(null)).rejects.toThrow(/weekly_shape/);
    await expect(add('{8}')).rejects.toThrow(/weekdays_valid/);
  });
});

describe('chores and tasks anyone can hand out', () => {
  it('the 14-year-old gives a shared task to the 21-year-old and can still change it; others cannot', async () => {
    const task = await as('junior', () => addObject({ name: 'Return my library book', type: 'Chore or task', owner: id.eldest }));
    await expect(as('junior', () => db.query(
      `insert into rules (object_id, name, kind, event_kind, due_on, owner_id) values ($1, 'Do it', 'fixed_date', 'Done', '2026-10-25', $2)`,
      [task, id.eldest]))).resolves.toBeTruthy();
    expect((await as('junior', () => db.query(`update objects set name = 'Return the library book' where id = $1`, [task]))).affectedRows).toBe(1);
    expect((await as('second', () => db.query(`update objects set name = 'nope' where id = $1`, [task]))).affectedRows).toBe(0);
    expect((await as('eldest', () => db.query(`update objects set name = 'Library book' where id = $1`, [task]))).affectedRows).toBe(1);
  });

  it('handing out stays limited to chores and tasks', async () => {
    expect((await as('junior', () => db.query(`update objects set name = 'mine now' where id = $1`, [car]))).affectedRows).toBe(0);
  });
});

describe('turns', () => {
  let dishes: string, marleys: string, lucys: string, eggs: string;
  beforeAll(async () => {
    dishes = await as('sam', () => addObject({ name: 'Dishes', type: 'Chore or task', owner: id.sam }));
    eggs = await as('sam', () => addObject({ name: 'Eggs', type: 'Chore or task', owner: id.sam }));
    const rule = (who: string, days: string) => as('sam', () => rows(
      `insert into rules (object_id, name, kind, event_kind, weekdays, owner_id) values ($1, 'Done', 'weekly', 'Done', $2::smallint[], $3) returning id`,
      [dishes, days, who]));
    marleys = (await rule(id.second, '{2,7}'))[0].id as string;
    lucys = (await rule(id.junior, '{1,4}'))[0].id as string;
  });

  it('an entry can say whose turn it was, and a fix keeps it', async () => {
    const [e] = await as('eldest', () => rows(
      `insert into events (object_id, kind, occurred_on, created_by, rule_id) values ($1, 'Done', '2026-10-20', $2, $3) returning id, rule_id`,
      [dishes, id.eldest, marleys]));
    expect(e.rule_id).toBe(marleys);
    const [fix] = await as('eldest', () => rows(
      `insert into events (object_id, kind, occurred_on, created_by, correction_of) values ($1, 'Done', '2026-10-21', $2, $3) returning rule_id`,
      [dishes, id.eldest, e.id]));
    expect(fix.rule_id).toBe(marleys);
    expect((await as('sam', () => rows('select rule_id from effective_events where object_id = $1', [dishes])))[0].rule_id).toBe(marleys);
  });

  it('an entry cannot name a turn on a different item', async () => {
    await expect(as('eldest', () => db.query(
      `insert into events (object_id, kind, occurred_on, created_by, rule_id) values ($1, 'Done', '2026-10-20', $2, $3)`,
      [eggs, id.eldest, lucys]))).rejects.toThrow(/different item/);
  });
});

describe('activities and work', () => {
  let scouts: string, slot: string;
  beforeAll(async () => {
    scouts = await as('junior', () => addObject({ name: 'Scouts', type: 'Activities', owner: id.junior, fields: { place: 'Scout hut' } }));
  });

  it('the person adds their own times; parents can too; others cannot', async () => {
    const add = (who: keyof typeof authId) => as(who, () => rows(
      `insert into activity_slots (object_id, weekdays, starts_at, ends_at, drop_off_by, pick_up_by)
       values ($1, '{4}', '17:00', '19:00', $2, $3) returning id, created_by`, [scouts, id.crystal, id.sam]));
    const [mine] = await add('junior');
    slot = mine.id as string;
    expect(mine.created_by).toBe(id.junior);
    await expect(add('crystal')).resolves.toHaveLength(1);
    await expect(add('eldest')).rejects.toThrow(/row-level security/);
    expect((await as('eldest', () => rows('select id from activity_slots where object_id = $1', [scouts]))).length).toBe(2);
  });

  it('one date can change who drives, only on one of its days, and go back to the usual', async () => {
    await as('sam', () => db.query(
      `insert into activity_changes (slot_id, on_date, drop_off_by, pick_up_by) values ($1, '2026-10-22', $2, $2)`, [slot, id.sam]));
    const [c] = await as('junior', () => rows('select changed_by, drop_off_by from activity_changes where slot_id = $1', [slot]));
    expect(c).toEqual({ changed_by: id.sam, drop_off_by: id.sam });
    await expect(as('sam', () => db.query(
      `insert into activity_changes (slot_id, on_date) values ($1, '2026-10-23')`, [slot]))).rejects.toThrow(/one of its days/);
    await expect(as('eldest', () => db.query(
      `insert into activity_changes (slot_id, on_date, cancelled) values ($1, '2026-10-29', true)`, [slot]))).rejects.toThrow(/row-level security/);
    expect((await as('junior', () => db.query(`delete from activity_changes where slot_id = $1`, [slot]))).affectedRows).toBe(1);
  });

  it('strangers see nothing', async () => {
    expect(await as('stranger', () => rows('select * from activity_slots'), 'stranger@example.com')).toEqual([]);
  });
});

describe('phone reminders', () => {
  const save = (who: keyof typeof authId, endpoint: string) => as(who, () => db.query(
    `select save_push_subscription($1, 'key', 'auth', 'Pixel')`, [endpoint]));

  it('each person saves and sees only their own phones; a phone signed in as someone else moves over', async () => {
    await save('junior', 'https://push.example/one');
    expect((await as('junior', () => rows('select member_id from push_subscriptions')))).toEqual([{ member_id: id.junior }]);
    expect(await as('sam', () => rows('select * from push_subscriptions'))).toEqual([]);
    await save('crystal', 'https://push.example/one');
    expect(await as('junior', () => rows('select * from push_subscriptions'))).toEqual([]);
    await expect(as('crystal', () => db.query(`insert into push_subscriptions (endpoint, member_id, p256dh, auth) values ('https://x', $1, 'k', 'a')`, [id.junior])))
      .rejects.toThrow(/permission denied/);
    await expect(save('stranger', 'https://push.example/two')).rejects.toThrow(/Not signed in/);
  });

  it('nobody can read what was sent', async () => {
    await expect(as('sam', () => rows('select * from notification_log'))).rejects.toThrow(/permission denied/);
  });
});

describe('private calendar links', () => {
  it('a link shows only what its person can see, and a new link kills the old one', async () => {
    const [{ calendar_link_reset: first }] = await as('eldest', () => rows('select calendar_link_reset()'));
    await db.exec('set role anon');
    const data = (await rows('select calendar_data($1) as d', [first]).finally(() => db.exec('reset role')))[0].d as
      { member_id: string; objects: { name: string }[] };
    expect(data.member_id).toBe(id.eldest);
    const seen = data.objects.map((o) => o.name);
    expect(seen).toContain('Škoda Octavia');
    expect(seen).toContain('Uni deadlines'); // their own private item
    expect(seen).not.toContain("Crystal's passport"); // someone else's personal item

    const [{ calendar_link_reset: second }] = await as('eldest', () => rows('select calendar_link_reset()'));
    await db.exec('set role anon');
    try {
      expect((await rows('select calendar_data($1) as d', [first]))[0].d).toBeNull();
      expect((await rows('select calendar_data($1) as d', [second]))[0].d).not.toBeNull();
      expect((await rows('select calendar_data($1) as d', ['short']))[0].d).toBeNull();
      await expect(rows('select * from calendar_links')).rejects.toThrow(/permission denied/);
    } finally { await db.exec('reset role'); }
    expect(await as('sam', () => rows('select * from calendar_links where member_id = $1', [id.eldest]))).toEqual([]);
  });
});

describe('Benji mode on the family tablet', () => {
  let chore: string;
  const childLog = (who: keyof typeof authId, pin: string, objectId = chore) => as(who, async () =>
    (await rows('select child_log($1, $2, $3, null) as r', [id.child, pin, objectId]))[0].r as { result: string; waiting?: boolean });

  beforeAll(async () => {
    chore = await as('sam', () => addObject({ name: 'Make my bed', type: 'Chore or task', owner: id.child }));
  });

  it('only a parent sets PINs: their own or a child’s, four digits', async () => {
    await as('sam', () => db.query(`select set_pin($1, '4321')`, [id.child]));
    await as('sam', () => db.query(`select set_pin($1, '1111')`, [id.sam]));
    await expect(as('sam', () => db.query(`select set_pin($1, '2222')`, [id.crystal]))).rejects.toThrow(/own PIN or a child/);
    await expect(as('sam', () => db.query(`select set_pin($1, '12a4')`, [id.child]))).rejects.toThrow(/4 digits/);
    await expect(as('eldest', () => db.query(`select set_pin($1, '1234')`, [id.child]))).rejects.toThrow(/Only Mum or Dad/);
    const set = (await as('sam', () => rows('select pins_set as id from pins_set()'))).map((r) => r.id).sort();
    expect(set).toEqual([id.sam, id.child].sort());
    expect(await as('eldest', () => rows('select * from pins_set()'))).toEqual([]);
  });

  it('Benji’s chore is saved as his and waits for a parent; a wrong PIN saves nothing', async () => {
    expect(await childLog('sam', '0000')).toEqual({ result: 'wrong' });
    expect(await childLog('sam', '4321')).toEqual({ result: 'ok', waiting: true });
    const logged = await rows('select created_by, needs_confirmation from events where object_id = $1', [chore]);
    expect(logged).toEqual([{ created_by: id.child, needs_confirmation: true }]);
  });

  it('five wrong tries lock his PIN, even for the right one, until a parent resets it', async () => {
    for (let i = 0; i < 4; i++) expect((await childLog('sam', '9999')).result).toBe('wrong');
    expect((await childLog('sam', '9999')).result).toBe('locked');
    expect((await childLog('sam', '4321')).result).toBe('locked');
    await as('sam', () => db.query(`select set_pin($1, '4321')`, [id.child]));
    expect((await childLog('sam', '4321')).result).toBe('ok');
  });

  it('only works on a parent’s tablet, and only for his own chores', async () => {
    await expect(childLog('eldest', '4321')).rejects.toThrow(/family tablet/);
    await expect(childLog('sam', '4321', car)).rejects.toThrow(/Not one of their chores/);
  });

  it('either parent’s PIN takes the tablet out of Benji mode', async () => {
    expect((await as('crystal', () => rows(`select check_parent_pin('2222') as r`)))[0].r).toBe('wrong');
    expect((await as('crystal', () => rows(`select check_parent_pin('1111') as r`)))[0].r).toBe('ok');
    await expect(as('junior', () => rows(`select check_parent_pin('1111')`))).rejects.toThrow(/family tablet/);
  });

  it('nobody can read PIN hashes or call the checker directly', async () => {
    await expect(as('sam', () => rows('select * from member_pins'))).rejects.toThrow(/permission denied/);
    await expect(as('sam', () => rows(`select app.check_pin($1, '4321')`, [id.child]))).rejects.toThrow(/permission denied/);
  });
});

describe('chores that log to an item', () => {
  it('writes the chore’s entry into the item’s history, and only there', async () => {
    const hens = await as('sam', () => addObject({ name: 'Hens', type: 'Animal or flock', owner: id.sam, group: true, fields: { species: ['Chicken'] } }));
    const coop = await as('sam', () => addObject({ name: 'Clean the coop', type: 'Chore or task', owner: id.eldest }));
    const rule = (await as('sam', () => rows(
      `insert into rules (object_id, name, kind, event_kind, every_days, owner_id, completion, logs_to)
       values ($1, 'Clean the coop', 'interval', 'Clean the coop', 7, $2, 'log', $3) returning id`, [coop, id.eldest, hens])))[0].id;
    await as('eldest', () => db.query(
      `insert into events (object_id, kind, occurred_on, created_by, rule_id) values ($1, 'Clean the coop', '2026-10-29', $2, $3)`,
      [hens, id.eldest, rule]));
    expect((await rows('select count(*)::int n from events where object_id = $1 and rule_id = $2', [hens, rule]))[0].n).toBe(1);
    await expect(as('eldest', () => db.query(
      `insert into events (object_id, kind, occurred_on, created_by, rule_id) values ($1, 'x', '2026-10-29', $2, $3)`,
      [car, id.eldest, rule]))).rejects.toThrow(/different item/);
  });

  it('each person sets how long things stay in their own Feed', async () => {
    await as('eldest', () => db.query('select set_feed_days(30)'));
    expect((await rows('select feed_days from members where id = $1', [id.eldest]))[0].feed_days).toBe(30);
    expect((await rows('select feed_days from members where id = $1', [id.sam]))[0].feed_days).toBe(14);
    await expect(as('eldest', () => db.query('select set_feed_days(0)'))).rejects.toThrow(/between 1 and 365/);
  });
});
