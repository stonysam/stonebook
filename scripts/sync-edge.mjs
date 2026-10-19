// Copies the shared planning code into the reminder function, with the file extensions
// Deno needs. Run `npm run edge:sync` after changing src/engine; a test checks it's current.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const FILES = ['dates.ts', 'due.ts', 'plan.ts'];
export const forDeno = (src) => src.replace(/from '(\.\/[a-z-]+)'/g, "from '$1.ts'");

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = new URL('../supabase/functions/remind/_engine/', import.meta.url);
  mkdirSync(out, { recursive: true });
  for (const f of FILES) {
    const src = readFileSync(new URL(`../src/engine/${f}`, import.meta.url), 'utf8');
    writeFileSync(new URL(f, out), `// Generated from src/engine/${f} by scripts/sync-edge.mjs. Do not edit.\n${forDeno(src)}`);
  }
  console.log('Synced', FILES.join(', '));
}
