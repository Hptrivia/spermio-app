import { SUPABASE_KEY, SUPABASE_URL } from './config/supabase';

/** Calls a database function. No SDK needed: the API is plain HTTPS. */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
