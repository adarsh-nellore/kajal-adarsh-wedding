// The admin session: an HttpOnly cookie holding an expiry signed with SESSION_SECRET
// (HMAC-SHA256). Used by the middleware (pages) and by api/guests.js (writes), so
// neither trusts the other. Web Crypto only, so it runs on Edge and Node alike.

export const COOKIE = 'ka_admin';
const DAYS = 30;

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sign(text) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET is not set');
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function passwordOk(given) {
  const want = process.env.ADMIN_PASSWORD;
  if (!want || typeof given !== 'string') return false;
  return same(given.trim().toLowerCase(), want.trim().toLowerCase());
}

export async function sessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + DAYS * 86400;
  const value = `${exp}.${await sign('admin:' + exp)}`;
  return `${COOKIE}=${value}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Strict`;
}

export const clearCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

export async function authed(request) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]*)'));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!/^\d+$/.test(exp || '') || !sig || Number(exp) < Date.now() / 1000) return false;
  try {
    return same(sig, await sign('admin:' + exp));
  } catch {
    return false;
  }
}
