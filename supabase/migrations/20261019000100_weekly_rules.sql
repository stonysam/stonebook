-- weekdays: ISO days the rule falls on, 1 = Monday … 7 = Sunday.
alter table public.rules add column weekdays smallint[];

alter table public.rules add constraint weekdays_valid
  check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]));

alter table public.rules add constraint weekly_shape
  check (kind <> 'weekly' or weekdays is not null);
