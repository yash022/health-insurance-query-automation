import { createAuthClient } from '../../../lib/supabase/server';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return new Response('Invalid origin', { status: 403 });
  }
  const client = await createAuthClient();
  if (client) await client.auth.signOut();
  return new Response(null, {
    status: 303,
    headers: { Location: '/login', 'Cache-Control': 'no-store' },
  });
}
