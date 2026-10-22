// 管理画面の本人確認。
// /admin は Cloudflare Access で保護し、Access が付けてくる署名つきトークン（JWT）を
// ここでも検証します。Access の設定漏れがあっても管理画面は開けません。
//
// 必要な環境変数:
//   ACCESS_TEAM_DOMAIN  例: heion.cloudflareaccess.com
//   ACCESS_AUD          Access アプリケーションの「Application Audience (AUD) Tag」
// ローカル開発だけ: DEV_ADMIN=1 で検証をスキップ（本番では絶対に設定しない）

let keyCache = { domain: null, keys: null, fetchedAt: 0 };

function b64urlToBytes(input) {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const b64urlJson = (input) => JSON.parse(new TextDecoder().decode(b64urlToBytes(input)));

function teamOrigin(domain) {
  const d = String(domain).trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${d.includes('.') ? d : `${d}.cloudflareaccess.com`}`;
}

async function getKeys(origin, force = false) {
  const fresh = Date.now() - keyCache.fetchedAt < 60 * 60 * 1000;
  if (!force && keyCache.domain === origin && keyCache.keys && fresh) return keyCache.keys;
  const res = await fetch(`${origin}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs: ${res.status}`);
  const json = await res.json();
  keyCache = { domain: origin, keys: json.keys || [], fetchedAt: Date.now() };
  return keyCache.keys;
}

function readToken(request) {
  const header = request.headers.get('cf-access-jwt-assertion');
  if (header) return header;
  const cookie = request.headers.get('cookie') || '';
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return m ? m[1] : null;
}

export async function getAdminUser(request, env) {
  if (env.DEV_ADMIN === '1') return { email: 'dev@localhost', dev: true };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;

  const token = readToken(request);
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const header = b64urlJson(parts[0]);
    const payload = b64urlJson(parts[1]);
    if (header.alg !== 'RS256') return null;

    const origin = teamOrigin(env.ACCESS_TEAM_DOMAIN);
    let jwk = (await getKeys(origin)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await getKeys(origin, true)).find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < now) return null;
    if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;
    if (payload.iss !== origin) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;

    return { email: payload.email || '(unknown)' };
  } catch {
    return null;
  }
}
