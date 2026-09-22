// Supabase Realtime on the public "signals" table: server bumps a version, client refetches its private view.
import { createClient } from '@supabase/supabase-js';
let client = null;
function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
export function subscribeSignal(channel, cb) {
  const c = sb();
  if (!c) return () => {};
  const ch = c.channel('sig-' + channel + '-' + Math.random().toString(36).slice(2, 7))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'signals', filter: `channel=eq.${channel}` }, () => cb())
    .subscribe();
  return () => { try { c.removeChannel(ch); } catch (e) { /* noop */ } };
}
