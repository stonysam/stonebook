import { redirect } from 'next/navigation';

// "Things" became the Log (29 Oct 2026); old links and bookmarks land there.
export default async function Things({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  redirect(q ? `/log?q=${encodeURIComponent(q)}` : '/log');
}
