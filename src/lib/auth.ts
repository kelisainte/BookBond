import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export function authConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
export async function supabaseServer() {
  if (!authConfigured()) throw new Error('Authentication is not configured');
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() { return jar.getAll(); },
      setAll(items) { try { items.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Server Component refresh uses proxy. */ } }
    }
  });
}
export async function currentUser() {
  if (!authConfigured()) return null;
  const client = await supabaseServer();
  const { data: { user }, error } = await client.auth.getUser();
  return error ? null : user;
}
