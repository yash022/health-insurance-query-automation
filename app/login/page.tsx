import { redirect } from 'next/navigation';
import { getUser } from '../../lib/auth';
import { createAuthClient } from '../../lib/supabase/server';

export const dynamic = 'force-dynamic';

async function login(form: FormData) {
  'use server';
  const client = await createAuthClient();
  if (!client) redirect('/login?error=setup');
  const { error } = await client.auth.signInWithPassword({
    email: String(form.get('email') || '').trim(),
    password: String(form.get('password') || ''),
  });
  if (error) redirect('/login?error=credentials');
  redirect('/');
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getUser()) redirect('/');
  const { error } = await searchParams;
  const configured = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="eyebrow">CARE.FI · PATIENT LOCKER</div>
        <h1>Welcome back.</h1>
        <p>Sign in to your private patient workspace.</p>
        {(!configured || error === 'setup') && (
          <p role="alert">
            Sign-in is not configured yet. Ask your workspace administrator to
            finish setup.
          </p>
        )}
        {error === 'credentials' && (
          <p role="alert">
            Unable to sign in. Check your email and password and try again.
          </p>
        )}
        <form action={login}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
          />
          <button className="btn primary" disabled={!configured}>
            Sign in
          </button>
        </form>
        <small>Accounts are provisioned by your workspace administrator.</small>
      </section>
    </main>
  );
}
