# Stonebook

One shared record of everything the family looks after — vehicles, machines, animals, the house,
documents, bills, subscriptions and chores — with owners, history and reminders.
Scope: see the "Stonebook MVP Scope" doc.

## Status: milestone 1 done, milestone 2 next

| Part | Where | State |
|---|---|---|
| Schema: members, object types, fields, objects, events, rules | `supabase/migrations/` | Done, tested |
| Visibility and permissions (row-level security) | same migration | Done, tested |
| Starter object types and fields | `supabase/seed.sql` | Done |
| Due-date engine (interval, usage, fixed date, record only) | `src/engine/` | Done, tested |
| Google-only sign-in check | `supabase/migrations/20261018200000_…` | Done, tested |
| Parent confirmation of kids' chores | same migration | Done, tested (database) |
| Family feed and emoji reactions | same migration | Done, tested (database) |
| App screens, Google sign-in UI | — | Next |

## How it works

- **Events are an append-only ledger.** Nothing is edited or deleted; a mistake is fixed by
  logging a correction (`correction_of`), optionally voiding the original. The database refuses
  updates and deletes on events for every role.
- **Due dates are derived, never stored.** `src/engine/due.ts` computes them from the effective
  events plus each rule, and explains its reasoning in plain language (`basis`).
- **Visibility is enforced in Postgres**, so a bug in the app can't leak an item:

| Visibility | Who sees it |
|---|---|
| `shared` | Whole family |
| `personal` | Owner and both parents; owner or a parent can switch on "share with family" |
| `private` | Owner only, parents included. Only someone who created **and** owns an item can make it private, so chores a parent assigns can't be hidden |

| Role | Can |
|---|---|
| parent | Everything except other people's private items |
| member (17, 21) | Create and edit their own items and rules, log events on anything they can see |
| junior (14) | Create their own items (homework, school), log events; shared items are read-only |
| child (7) | No direct access; PIN profile via the family device (milestone 4) |

- **Kids' chores wait for a parent.** When the 14- or 7-year-old logs a chore someone else set
  them, the database marks it `needs_confirmation` (the app can't skip this). It doesn't count
  for due dates or the feed until either parent approves it (`confirmations`); the request
  goes to whoever set the chore (`awaiting_confirmation.assigned_by`). A decision is final;
  a refused chore is logged again. Chores the 17- and 21-year-old log count straight away.
- **Family feed.** `family_feed` lists what got done on items the whole family can see
  (shared, or personal switched to "share with family"), announced when logged or when a
  parent approved it. Anyone with a login can react with one of six emoji
  (`clap`, `fire`, `heart`, `star`, `muscle`, `wolf`). Reactions hang off the original entry
  (`events.root_id`), so a correction keeps them and isn't announced twice. In-app only, with
  a badge from `feed_seen`; no push.

## Run the tests

```bash
npm install
npm test        # 56 tests: engine + database security rules on real Postgres (PGlite)
npm run typecheck
```

## Setting up Supabase (Sam)

1. Create a Supabase project in the **EU (Frankfurt)** region.
2. Authentication → Sign In / Providers → enable **Google** only (switch off Email, Phone and
   Anonymous); create the OAuth client in Google Cloud Console and paste its client ID and secret.
3. Apply every file in `supabase/migrations/` in order, then `supabase/seed.sql`.
4. Add the family allow-list (Google account emails), for example:

```sql
insert into members (display_name, role, email) values
  ('Sam', 'parent', 'sam@…'),
  ('Crystal', 'parent', 'crystal@…'),
  ('Name21', 'member', '…'),
  ('Name17', 'member', '…'),
  ('Name14', 'junior', '…'),
  ('Name7', 'child', null);
```

On first sign-in the app calls `app.claim_membership()`, which links the Google account to the
member with the same email, and only for a Google sign-in. Anyone not on the list can sign in
to Google but sees nothing.
