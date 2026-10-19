import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './env';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { KID_COOKIE, KID_PATHS } from '@/lib/kid';

// /cal/ is the private calendar feed: calendar apps can't sign in, the link's token is the key.
const PUBLIC_PATHS = ['/login', '/auth/callback', '/not-on-list', '/manifest.webmanifest', '/cal/'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value as string));
        },
      },
    },
  );

  // Refreshes the session; nothing may run between creating the client and this call.
  const { data } = await supabase.auth.getClaims();

  const path = request.nextUrl.pathname;
  if (!data?.claims && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  // Benji mode: this device stays on the child's screen until a parent's PIN unlocks it.
  if (data?.claims && request.cookies.get(KID_COOKIE)?.value && !KID_PATHS.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/kid';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}
