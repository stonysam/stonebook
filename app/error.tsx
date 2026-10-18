'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page" style={{ justifyContent: 'center', minHeight: '80dvh' }}>
      <h1>Something went wrong</h1>
      <p className="muted" style={{ margin: 0 }}>Check your connection and try again. Nothing you saved before this was lost.</p>
      <button className="btn btn-primary" onClick={reset}>Try again</button>
    </main>
  );
}
