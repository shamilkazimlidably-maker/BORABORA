import { tg } from './tg';

function devUser() {
  if (typeof window === 'undefined') return null;
  const u = new URLSearchParams(window.location.search).get('dev');
  if (u) { try { sessionStorage.setItem('bb_dev', u); } catch (e) { /* noop */ } return u; }
  try { return sessionStorage.getItem('bb_dev'); } catch (e) { return null; }
}
export function startParam() {
  if (typeof window === 'undefined') return null;
  return tg()?.initDataUnsafe?.start_param || new URLSearchParams(window.location.search).get('startapp') ||
    new URLSearchParams(window.location.search).get('tgWebAppStartParam') || null;
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const init = tg()?.initData;
  if (init) headers['x-tg-init'] = init;
  const dev = devUser();
  if (dev && !init) { headers['x-dev-user'] = dev; const sp = startParam(); if (sp) headers['x-dev-start'] = sp; }
  const res = await fetch('/api/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const err = new Error(data?.message || 'Algo deu errado');
    err.code = data?.error; err.status = res.status;
    throw err;
  }
  return data;
}
