import 'server-only';
import { redirect } from 'next/navigation';
import { createAuthClient } from './supabase/server';

export async function getUser() {
  const client = await createAuthClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return {
    userId: data.user.id,
    email: data.user.email || '',
    displayName:
      data.user.user_metadata?.full_name || data.user.email || 'Care team',
  };
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}
