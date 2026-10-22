// 写真の保存・取り出し（写真用 D1 データベース、バインディング名 PHOTOS）
// R2 を使わないので、支払い方法の登録なしで動きます。
// D1 の無料プランは上限に達すると止まるだけで、料金は発生しません。

export const MAX_PHOTO_BYTES = 1024 * 1024; // 1MB（D1 の1行の上限 2MB より小さく）
export const PHOTO_TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const KEY_RE = /^articles\/\d+\/[0-9a-f-]+\.(webp|jpg|png)$/;

export const hasPhotoStore = (env) => !!env.PHOTOS;

export async function putPhoto(env, key, file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  await env.PHOTOS.prepare(`INSERT OR REPLACE INTO photos (key, content_type, size, data) VALUES (?, ?, ?, ?)`)
    .bind(key, file.type, bytes.byteLength, bytes)
    .run();
}

export async function deletePhoto(env, key) {
  try {
    if (env.PHOTOS && key) await env.PHOTOS.prepare(`DELETE FROM photos WHERE key = ?`).bind(key).run();
  } catch (err) {
    console.error('photo delete failed', err);
  }
}

export async function servePhoto(env, key, request) {
  if (!env.PHOTOS || !KEY_RE.test(key)) return new Response('Not found', { status: 404 });

  // 写真のURLは中身ごとに変わる（差し替えると新しいキーになる）ので、ブラウザに長く保存させる
  const etag = `"${key}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag, 'cache-control': 'public, max-age=31536000, immutable' } });
  }

  const row = await env.PHOTOS.prepare(`SELECT content_type, data FROM photos WHERE key = ?`).bind(key).first();
  if (!row) return new Response('Not found', { status: 404 });

  // D1 は BLOB を数値の配列で返す（環境によっては ArrayBuffer / Uint8Array）
  const data = row.data;
  const body = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : Uint8Array.from(data);

  return new Response(body, {
    headers: {
      'content-type': row.content_type,
      'content-length': String(body.byteLength),
      'cache-control': 'public, max-age=31536000, immutable',
      etag,
    },
  });
}
