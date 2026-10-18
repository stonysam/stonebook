-- Rules that fall on set days each week (feed the hens Tue and Fri).
-- A new enum value can't be used in the transaction that adds it, so this is its own migration.
alter type public.rule_kind add value if not exists 'weekly' before 'record';
