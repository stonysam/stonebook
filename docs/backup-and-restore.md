# Backup and restore (free plan)

Supabase's free plan has no backups and pauses a project after a week without activity.
`.github/workflows/nightly.yml` covers both at no cost: every night it checks in with Supabase,
dumps the family data, copies the photos (animal photos, kept in Supabase Storage), encrypts
both with a passphrase only Sam holds, and keeps them for 30 days as a download on the workflow run.

What it protects against: losing the project or its data. What it doesn't: anything entered
since the last nightly run.

## One-time setup (Sam)

1. **Database address.** Supabase dashboard → stonebook → **Connect** → **Session pooler** → copy
   the URI. Put the database password where it says `[YOUR-PASSWORD]`. If you don't know the
   password: Project Settings → Database → **Reset database password**. The app doesn't use this
   password, so resetting it changes nothing for the family.
2. **Passphrase.** Generate a long random passphrase in your password manager and save it there,
   named "Stonebook backup passphrase". Without it the backups can't be opened.
3. **GitHub secrets.** github.com/stonysam/stonebook → Settings → Secrets and variables → Actions →
   **New repository secret**, twice:
   - `SUPABASE_DB_URL`: the URI from step 1
   - `BACKUP_PASSPHRASE`: the passphrase from step 2
4. **Photo key** (added 20 Oct). Supabase dashboard → stonebook → **Storage** → **S3**
   (Configuration) → **New access key**, description "Nightly backup". Copy both values straight
   into two more GitHub secrets (the secret is shown once):
   - `SUPABASE_S3_ACCESS_KEY_ID`
   - `SUPABASE_S3_SECRET_ACCESS_KEY`
   Without them the database is still backed up; the run just warns that photos weren't.
5. Tell Claude, who runs the workflow once to check it works.

Security note: anyone who can change this repo's workflows could read the database and every
photo through these secrets (the photo key ignores the app's privacy rules). Today that is only
Sam. If a key leaks, revoke it in the same Supabase screen and make a new one.

## Restore

Ask Claude to do this with you; the steps are here so it's never guesswork.

1. GitHub → **Actions** → *Nightly check-in and backup* → pick the night you want → download the
   artifact and unzip it. It holds `stonebook-YYYY-MM-DD.sql.gpg` (data) and
   `stonebook-photos-YYYY-MM-DD.tar.gpg` (photos).
2. Decrypt (asks for the passphrase):
   `gpg --decrypt stonebook-YYYY-MM-DD.sql.gpg > stonebook.sql`
   `gpg --decrypt stonebook-photos-YYYY-MM-DD.tar.gpg | tar -xf -` (makes a `photos` folder)
3. Create a new Supabase project in Frankfurt and apply every file in `supabase/migrations/`
   in order. Don't run `seed.sql`; the backup already holds the item types.
4. Load the data with triggers paused, all in one go (Supabase's documented method):
   ```bash
   psql --single-transaction -v ON_ERROR_STOP=1 \
     -c 'SET session_replication_role = replica' \
     -f stonebook.sql \
     -d "<new project's session pooler URI>"
   ```
5. Unlink the old sign-ins so everyone re-links on their next Google sign-in:
   `update members set auth_user_id = null;`
6. Put the photos back (the migrations already made the `photos` bucket), with an S3 key from the
   new project:
   `aws s3 sync photos s3://photos --endpoint-url https://<new-ref>.storage.supabase.co/storage/v1/s3`
   File paths start with the item's id, so they line up with the restored data.
7. Point Google sign-in (redirect URI) and the app (`lib/supabase/env.ts`) at the new project.
8. Delete `stonebook.sql` and the `photos` folder; they are the unencrypted family data.

Tested on 18 Oct 2026: a dump of sample data restored into a fresh database matched row for row,
and the restored database still enforced its rules (append-only history, the family feed).
`pg_dump` prints a warning about circular foreign keys on `events`; step 4 handles it.
