-- Starter object types and fields. Parents can add more from the app.
-- Run once after the migrations (Supabase runs supabase/seed.sql on `supabase db reset`).

insert into public.object_types (name, icon, sort_order, confirm_kid_logs, assignable) values
  ('Person',          'user',     10, false, false),
  ('Activity or work','calendar', 15, false, false),
  ('Vehicle',         'car',      20, false, false),
  ('Machine',         'tractor',  30, false, false),
  ('Animal or flock', 'paw',      40, false, false),
  ('Home system',     'home',     50, false, false),
  ('Document',        'id-card',  60, false, false),
  ('Bill',            'receipt',  70, false, false),
  ('Subscription',    'repeat',   80, false, false),
  ('Chore or task',   'check',    90, true,  true)
on conflict (name) do nothing;

with t as (select id, name from public.object_types)
insert into public.field_defs (object_type_id, key, label, kind, options, required, sort_order)
select t.id, f.key, f.label, f.kind::public.field_kind, f.options::jsonb, f.required, f.sort_order
from t
join (values
  ('Person',          'member',        'Family member',      'person', null, false, 10),
  ('Person',          'health_insurer','Health insurer',     'text',   null, false, 20),
  ('Person',          'doctor',        'GP / doctor',        'text',   null, false, 30),

  ('Vehicle',         'make',          'Make',               'text',   null, false, 10),
  ('Vehicle',         'model',         'Model',              'text',   null, false, 20),
  ('Vehicle',         'plate',         'Registration plate', 'text',   null, false, 30),
  ('Vehicle',         'fuel',          'Fuel',               'choice', '["Petrol","Diesel","Electric","Hybrid","LPG"]', false, 40),
  ('Vehicle',         'tyre_size',     'Tyre size',          'text',   null, false, 50),
  ('Vehicle',         'insurer',       'Insurer',            'text',   null, false, 60),

  ('Machine',         'make',          'Make',               'text',   null, false, 10),
  ('Machine',         'model',         'Model',              'text',   null, false, 20),
  ('Machine',         'serial',        'Serial number',      'text',   null, false, 30),
  ('Machine',         'meter_unit',    'Usage measured in',  'choice', '["hours","km","none"]', false, 40),

  ('Animal or flock', 'species',       'Species',            'choice', '["Sheep","Goat","Chicken","Duck","Cattle","Horse","Donkey","Pig","Dog","Cat","Other"]', true, 10),
  ('Animal or flock', 'head_count',    'How many',           'number', null, false, 20),
  ('Animal or flock', 'vet',           'Vet',                'text',   null, false, 30),
  ('Animal or flock', 'photo',         'Photo',              'text',   null, false, 5),
  ('Animal or flock', 'birth_year',    'Year born',          'number', null, false, 15),

  ('Home system',     'location',      'Where it is',        'text',   null, false, 10),
  ('Home system',     'model',         'Model / part number','text',   null, false, 20),

  ('Document',        'doc_type',      'Document type',      'choice', '["Passport","ID card","Driving licence","Health insurance card","Vehicle registration","Insurance policy","Other"]', true, 10),
  ('Document',        'holder',        'Belongs to',         'person', null, false, 20),
  ('Document',        'kept_where',    'Where the original is kept', 'text', null, false, 30),

  ('Bill',            'supplier',      'Supplier',           'text',   null, true,  10),
  ('Bill',            'amount',        'Usual amount',       'number', null, false, 20),
  ('Bill',            'currency',      'Currency',           'choice', '["CZK","EUR","USD","GBP"]', false, 30),
  ('Bill',            'pay_method',    'How it''s paid',     'choice', '["Direct debit","Bank transfer","Card","Cash"]', false, 40),

  ('Subscription',    'provider',      'Provider',           'text',   null, true,  10),
  ('Subscription',    'amount',        'Price',              'number', null, false, 20),
  ('Subscription',    'currency',      'Currency',           'choice', '["CZK","EUR","USD","GBP"]', false, 30),
  ('Subscription',    'period',        'Billed',             'choice', '["Monthly","Yearly","Other"]', false, 40),

  ('Chore or task',   'picture',       'Picture (for younger kids)', 'choice', '["hens","eggs","dog","cat","bin","dishes","table","bed","toys","laundry","plants","teeth","book","broom","logs","star"]', false, 5),
  ('Chore or task',   'instructions',  'How to do it',       'text',   null, false, 10),

  ('Activity or work','place',         'Where',              'text',   null, false, 10),
  ('Activity or work','contact',       'Contact (leader, coach, manager)', 'text', null, false, 20)
) as f(type_name, key, label, kind, options, required, sort_order)
  on f.type_name = t.name
on conflict (object_type_id, key) do nothing;

-- An animal group can be several species (chickens and ducks; the horses and the donkey).
update public.field_defs f set multiple = true from public.object_types t
 where t.id = f.object_type_id and t.name = 'Animal or flock' and f.key = 'species';
update public.object_types set groups = true where name = 'Animal or flock';
