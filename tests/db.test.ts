// Runs the real migration against Postgres (PGlite, in-process) and checks the
// security rules by signing in as each family member.
import { readFileSync } from 'node:fs';
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
};

let db: PGlite;
let typeId: Record<string, string>;

async function as<T>(who: keyof typeof authId, fn: () => Promise<T>, email = `${who}@example.com`): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
    [authId[who], JSON.stringify({ sub: authId[who], email })]);
  await db.exec('set role authenticated');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

const rows = async (q: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(q, params)).rows;
const names = async (q: string, params: unknown[] = []) => (await rows(q, params)).map((r) => r.name).sort();

async function addObject(o: { name: string; type: string; owner: string; visibility?: string; share?: boolean; fields?: object }) {
  const r = await rows(
    `insert into objects (object_type_id, name, owner_id, visibility, share_with_family, field_values)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [typeId[o.type], o.name, o.owner, o.visibility ?? 'shared', o.share ?? false, JSON.stringify(o.fields ?? {})]);
  return r[0].id as string;
}

let car: string, crystalPassport: string, eldestPassport: string, secondInsurance: string, eldestDiary: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql('./supabase-auth-stub.sql'));
  await db.exec(sql('../supabase/migrations/20261018000000_init.sql'));
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
  eldestDiary = await as('eldest', () => addObject({ name: 'Uni deadlines', type: 'Chore', owner: id.eldest, visibility: 'private' }));
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
    await as('junior', () => addObject({ name: 'Maths homework', type: 'Chore', owner: id.junior, visibility: 'private' }));
    expect(await as('junior', () => names('select name from objects where owner_id = $1', [id.junior]))).toEqual(['Maths homework']);
    expect(await as('sam', () => names('select name from objects where owner_id = $1', [id.junior]))).toEqual([]);
  });

  it('nobody can create an item for someone else, except parents (and never a private one)', async () => {
    await expect(as('junior', () => addObject({ name: 'x', type: 'Chore', owner: id.eldest }))).rejects.toThrow(/row-level security/);
    await expect(as('sam', () => addObject({ name: 'y', type: 'Chore', owner: id.junior, visibility: 'private' }))).rejects.toThrow(/row-level security/);
    await expect(as('sam', () => addObject({ name: 'Feed chickens', type: 'Chore', owner: id.junior }))).resolves.toBeTruthy();
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
    const chore = await as('crystal', () => addObject({ name: 'Muck out the shed', type: 'Chore', owner: id.junior }));
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

describe('fields are checked against the object type', () => {
  it('rejects unknown fields, wrong types, bad choices and missing required fields', async () => {
    await expect(as('sam', () => addObject({ name: 'a', type: 'Vehicle', owner: id.sam, fields: { colour: 'red' } }))).rejects.toThrow(/Unknown field/);
    await expect(as('sam', () => addObject({ name: 'b', type: 'Vehicle', owner: id.sam, fields: { fuel: 'Steam' } }))).rejects.toThrow(/must be one of/);
    await expect(as('sam', () => addObject({ name: 'c', type: 'Animal or flock', owner: id.sam, fields: { head_count: 3 } }))).rejects.toThrow(/Species is required/);
    await expect(as('sam', () => addObject({ name: 'd', type: 'Animal or flock', owner: id.sam, fields: { species: 'Goat', head_count: 'three' } }))).rejects.toThrow(/must be a number/);
    await expect(as('sam', () => addObject({ name: 'e', type: 'Document', owner: id.sam, fields: { doc_type: 'Passport', holder: id.eldest } }))).resolves.toBeTruthy();
    await expect(as('sam', () => addObject({ name: 'f', type: 'Document', owner: id.sam, fields: { doc_type: 'Passport', holder: 'nobody' } }))).rejects.toThrow(/family member/);
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
