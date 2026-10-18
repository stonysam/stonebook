# Backup and restore (free plan)

Supabase's free plan has no backups and pauses a project after a week without activity.
`.github/workflows/nightly.yml` covers both at no cost: every night it checks in with Supabase,
dumps the family data, encrypts it with a passphrase only Sam holds, and keeps it for 30 days
as a download on the workflow run.

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
4. Tell Claude, who runs the workflow once to check it works.

Security note: anyone who can change this repo's workflows could read the database through
these secrets. Today that is only Sam.

## Restore

Ask Claude to do this with you; the steps are here so it's never guesswork.

1. GitHub → **Actions** → *Nightly check-in and backup* → pick the night you want → download the
   artifact and unzip it.
2. Decrypt (asks for the passphrase):
   `gpg --decrypt stonebook-YYYY-MM-DD.sql.gpg > stonebook.sql`
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
6. Point Google sign-in (redirect URI) and the app (Vercel environment variables) at the new project.
7. Delete `stonebook.sql`; it is the unencrypted family data.

Tested on 18 Oct 2026: a dump of sample data restored into a fresh database matched row for row,
and the restored database still enforced its rules (append-only history, the family feed).
`pg_dump` prints a warning about circular foreign keys on `events`; step 4 handles it.
