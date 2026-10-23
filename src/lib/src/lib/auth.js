// 管理画面のログイン（パスワード方式）
//
// 必要な環境変数（Cloudflare Pages の「変数とシークレット」にシークレットとして登録）:
//   ADMIN_PASSWORD  管理画面のパスワード（16文字以上）
//   VOTE_SALT       （投票用に登録済みのもの。ログインの署名にも使います）
// ローカル開発だけ: DEV_ADMIN=1 でログインをスキップ（本番では絶対に設定しない）
//
// ・ログインに成功すると、署名つきの Cookie（30日有効）を発行します
// ・パスワードを変えると、それまでのログインはすべて無効になります
// ・同じ回線から15分以内に5回間違えると、15分間ログインできなくなります

const COOKIE = 'hs_admin';
const SESSION_DAYS = 30;
const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;
export const MIN_PASSWORD_LENGTH = 16;

const enc = new TextEncoder();

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function passwordConfigured(env) {
  return typeof env.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.length >= MIN_PASSWORD_LENGTH;
}

async function signingKey(env) {
  const material = await sha256(`heion-admin-session:${env.ADMIN_PASSWORD}:${env.VOTE_SALT || ''}`);
  return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(env, payload) {
  const sig = await crypto.subtle.sign('HMAC', await signingKey(env), enc.encode(payload));
  return hex(new Uint8Array(sig));
}

function readCookie(request) {
  const cookie = request.headers.get('cookie') || '';
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(cookie);
  return m ? m[1] : null;
}

export async function getAdminUser(request, env) {
  if (env.DEV_ADMIN === '1') return { name: '開発用', dev: true };
  if (!passwordConfigured(env)) return null;
  const value = readCookie(request);
  if (!value) return null;
  const [exp, sig] = value.split('.');
  if (!/^\d+$/.test(exp || '') || !/^[0-9a-f]{64}$/.test(sig || '')) return null;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return null;
  const expected = await sign(env, `v1:${exp}`);
  if (!equalBytes(enc.encode(sig), enc.encode(expected))) return null;
  return { name: '管理者' };
}

export async function checkPassword(env, input) {
  if (!passwordConfigured(env)) return false;
  return equalBytes(await sha256(String(input || '')), await sha256(env.ADMIN_PASSWORD));
}

export async function sessionCookie(env, url) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60;
  const value = `${exp}.${await sign(env, `v1:${exp}`)}`;
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/admin/; Max-Age=${SESSION_DAYS * 24 * 60 * 60}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearCookie(url) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=; Path=/admin/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

// ---- 総当たり対策 ----------------------------------------------------------

export async function ipHashOf(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  return hex(await sha256(`login:${env.VOTE_SALT || 'heion-times'}:${ip}`)).slice(0, 32);
}

const windowStart = () => new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

export async function isLockedOut(db, ipHash) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND created_at >= ?`)
    .bind(ipHash, windowStart())
    .first();
  return (row?.n || 0) >= MAX_FAILURES;
}

export async function recordFailure(db, ipHash) {
  await db.batch([
    db.prepare(`INSERT INTO login_attempts (ip_hash) VALUES (?)`).bind(ipHash),
    // 1日以上前の記録は掃除
    db.prepare(`DELETE FROM login_attempts WHERE created_at < ?`).bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ]);
}

export const clearFailures = (db, ipHash) => db.prepare(`DELETE FROM login_attempts WHERE ip_hash = ?`).bind(ipHash).run();

export const LOCKOUT_MINUTES = WINDOW_MINUTES;
