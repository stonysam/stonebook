export const metadata = { title: 'Not on the family list · Stonebook' };

export default function NotOnList() {
  return (
    <main className="page" style={{ justifyContent: 'center', minHeight: '100dvh', maxWidth: 420 }}>
      <h1>This Google account isn&apos;t on the family list</h1>
      <p className="muted" style={{ margin: 0 }}>
        Stonebook is only for the Stone family. If you should have access, ask Sam or Crystal to add the
        Google account you just used, then sign in again.
      </p>
      <form action="/auth/signout" method="post">
        <button className="btn btn-block">Sign out and try another account</button>
      </form>
    </main>
  );
}
