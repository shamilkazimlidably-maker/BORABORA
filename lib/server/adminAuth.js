import crypto from 'crypto';
import { ApiError } from './db';

const COOKIE = 'bb_admin';
const secret = () => process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-secret';
const sign = (v) => crypto.createHmac('sha256', secret()).update(v).digest('hex');

export function issue(res) {
  const exp = Date.now() + 12 * 3600 * 1000;
  const token = `${exp}.${sign(String(exp))}`;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}`);
}
export function clear(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
export function checkPassword(pw) {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) throw new ApiError(500, 'config', 'ADMIN_PASSWORD ortam değişkeni tanımlı değil');
  const a = Buffer.from(sign(String(pw || '')));
  const b = Buffer.from(sign(real));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function requireAdmin(req) {
  const raw = (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(COOKIE + '='));
  const token = raw ? raw.slice(COOKIE.length + 1) : '';
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) throw new ApiError(401, 'admin_auth', 'Oturum süresi doldu, tekrar giriş yapın');
  const good = sign(exp);
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) {
    throw new ApiError(401, 'admin_auth', 'Geçersiz oturum');
  }
}
