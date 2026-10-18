import { SignInButton } from './sign-in-button';

export const metadata = { title: 'Sign in · Stonebook' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="page" style={{ justifyContent: 'center', minHeight: '100dvh', paddingBottom: 40, maxWidth: 420 }}>
      <img src="/icons/icon-192.png" alt="" width={96} height={96} style={{ alignSelf: 'center', borderRadius: 22 }} />
      <h1 style={{ textAlign: 'center', fontSize: 36 }}>Stonebook</h1>
      <p className="muted" style={{ textAlign: 'center', margin: 0 }}>The Black Wolf Farm family logbook</p>
      {error && (
        <p role="alert" className="card" style={{ margin: 0 }}>
          Sign-in didn&apos;t finish. Please try again.
        </p>
      )}
      <SignInButton />
    </main>
  );
}
