'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function SignInButton() {
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setBusy(false);
  }

  return (
    <button type="button" className="btn btn-primary btn-big btn-block" onClick={signIn} disabled={busy}>
      {busy ? 'Opening Google…' : 'Sign in with Google'}
    </button>
  );
}
