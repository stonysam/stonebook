-- Starter object types and fields. Parents can add more from the app.
-- Run once after the migrations (Supabase runs supabase/seed.sql on `supabase db reset`).

insert into public.object_types (name, icon, sort_order) values
  ('Person',         'user',     10),
  ('Vehicle',        'car',      20),
  ('Machine',        'tractor',  30),
  ('Animal or flock','paw',      40),
  ('Home system',    'home',     50),
  ('Document',       'id-card',  60),
  ('Bill',           'receipt',  70),
  ('Subscription',   'repeat',   80),
  ('Chore',          'check',    90);

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

  ('Animal or flock', 'species',       'Species',            'choice', '["Sheep","Goat","Chicken","Duck","Cattle","Horse","Pig","Dog","Cat","Other"]', true, 10),
  ('Animal or flock', 'head_count',    'How many',           'number', null, false, 20),
  ('Animal or flock', 'vet',           'Vet',                'text',   null, false, 30),

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

  ('Chore',           'instructions',  'How to do it',       'text',   null, false, 10)
) as f(type_name, key, label, kind, options, required, sort_order)
  on f.type_name = t.name;
