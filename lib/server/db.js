import { createClient } from '@supabase/supabase-js';

let _sb = null;
export function db() {
  if (!_sb) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new ApiError(500, 'config', 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes');
    _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _sb;
}

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new ApiError(500, 'db', error.message);
  return data;
}

export async function rpc(name, args) {
  const { data, error } = await db().rpc(name, args);
  if (error) {
    if (/insufficient_balance/.test(error.message)) throw new ApiError(400, 'insufficient_balance', 'Saldo insuficiente');
    throw new ApiError(500, 'db', error.message);
  }
  return data;
}

export function handler(methods, fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!methods.includes(req.method)) {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.status(200).json(out ?? { ok: true });
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error('[api]', req.url, e);
      if (!res.headersSent) res.status(status).json({ error: e.code || 'error', message: e.message });
    }
  };
}

export async function signal(channel) {
  try { await db().rpc('bump_signal', { p_channel: channel }); } catch (e) { /* realtime is best effort */ }
}

export const rid = (len = 8) => {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
};
