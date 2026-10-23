// D1 とのやり取りをまとめたファイル。
import { jstDateKey, nowIso, daysAgoIso } from './lib/time.js';

const ARTICLE_COLUMNS = `
  a.id, a.public_id, a.title, a.body_html, a.image_key, a.image_caption, a.place_id,
  a.status, a.is_top, a.published_at, a.created_at, a.updated_at,
  p.name AS place_name, p.slug AS place_slug,
  a.calm_count AS calm, a.rough_count AS rough
`;

const FROM = `FROM articles a LEFT JOIN places p ON p.id = a.place_id`;
const VISIBLE = `a.status = 'published' AND a.published_at <= ?`;

const all = async (stmt) => (await stmt.all()).results || [];

// ---- 読者側 ------------------------------------------------------------

export async function getTopArticle(db, now = nowIso()) {
  const top = await db
    .prepare(`SELECT ${ARTICLE_COLUMNS} ${FROM} WHERE ${VISIBLE} AND a.is_top = 1 ORDER BY a.published_at DESC LIMIT 1`)
    .bind(now)
    .first();
  if (top) return top;
  return db
    .prepare(`SELECT ${ARTICLE_COLUMNS} ${FROM} WHERE ${VISIBLE} ORDER BY a.published_at DESC LIMIT 1`)
    .bind(now)
    .first();
}

export function listLatest(db, { limit = 10, offset = 0, excludeId = 0, now = nowIso() } = {}) {
  return all(
    db
      .prepare(`SELECT ${ARTICLE_COLUMNS} ${FROM} WHERE ${VISIBLE} AND a.id != ? ORDER BY a.published_at DESC LIMIT ? OFFSET ?`)
      .bind(now, excludeId, limit, offset),
  );
}

export async function countVisible(db, now = nowIso()) {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM articles a WHERE ${VISIBLE}`).bind(now).first();
  return row ? row.n : 0;
}

export function getVisibleArticle(db, publicId, now = nowIso()) {
  return db
    .prepare(`SELECT ${ARTICLE_COLUMNS} ${FROM} WHERE a.public_id = ? AND ${VISIBLE}`)
    .bind(publicId, now)
    .first();
}

export function listByPlace(db, placeId, { limit = 20, offset = 0, excludeId = 0, now = nowIso() } = {}) {
  return all(
    db
      .prepare(`SELECT ${ARTICLE_COLUMNS} ${FROM} WHERE ${VISIBLE} AND a.place_id = ? AND a.id != ? ORDER BY a.published_at DESC LIMIT ? OFFSET ?`)
      .bind(now, placeId, excludeId, limit, offset),
  );
}

export function listByTag(db, tagId, { limit = 20, offset = 0, now = nowIso() } = {}) {
  return all(
    db
      .prepare(
        `SELECT ${ARTICLE_COLUMNS} ${FROM} JOIN article_tags t ON t.article_id = a.id
         WHERE ${VISIBLE} AND t.tag_id = ? ORDER BY a.published_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(now, tagId, limit, offset),
  );
}

// 直近7日間で「平穏ではない」の割合が高い順
export function listRanking(db, { limit = 5, days = 7, now = nowIso() } = {}) {
  return all(
    db
      .prepare(
        `SELECT ${ARTICLE_COLUMNS} ${FROM}
         WHERE ${VISIBLE} AND a.published_at >= ? AND a.rough_count > 0
         ORDER BY (a.rough_count * 1.0 / (a.calm_count + a.rough_count)) DESC, a.rough_count DESC, a.published_at DESC
         LIMIT ?`,
      )
      .bind(now, daysAgoIso(days, now), limit),
  );
}

// 平穏度（%）の範囲で絞り込み（min 以上 max 未満。max=101 で100%を含む）
const LEVEL_WHERE = `a.calm_count + a.rough_count > 0
  AND (a.calm_count * 100.0 / (a.calm_count + a.rough_count)) >= ?
  AND (a.calm_count * 100.0 / (a.calm_count + a.rough_count)) < ?`;

export function listByLevel(db, min, max, { limit = 30, offset = 0, now = nowIso() } = {}) {
  return all(
    db
      .prepare(`SELECT ${ARTICLE_COLUMNS} ${FROM} WHERE ${VISIBLE} AND ${LEVEL_WHERE} ORDER BY a.published_at DESC LIMIT ? OFFSET ?`)
      .bind(now, min, max, limit, offset),
  );
}

export async function countByLevel(db, min, max, now = nowIso()) {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM articles a WHERE ${VISIBLE} AND ${LEVEL_WHERE}`).bind(now, min, max).first();
  return row ? row.n : 0;
}

export function listTagsWithCounts(db, now = nowIso()) {
  return all(
    db
      .prepare(
        `SELECT t.id, t.name, t.slug, COUNT(a.id) AS count
         FROM tags t JOIN article_tags at ON at.tag_id = t.id JOIN articles a ON a.id = at.article_id AND ${VISIBLE}
         GROUP BY t.id ORDER BY count DESC, t.name`,
      )
      .bind(now),
  );
}

export function listPlacesWithCounts(db, now = nowIso()) {
  return all(
    db
      .prepare(
        `SELECT p.id, p.name, p.slug, COUNT(a.id) AS count
         FROM places p JOIN articles a ON a.place_id = p.id AND ${VISIBLE}
         GROUP BY p.id ORDER BY count DESC, p.name`,
      )
      .bind(now),
  );
}

export const getPlaceBySlug = (db, slug) => db.prepare(`SELECT * FROM places WHERE slug = ?`).bind(slug).first();
export const getTagBySlug = (db, slug) => db.prepare(`SELECT * FROM tags WHERE slug = ?`).bind(slug).first();

export async function countByPlace(db, placeId, now = nowIso()) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM articles a WHERE ${VISIBLE} AND a.place_id = ?`)
    .bind(now, placeId)
    .first();
  return row ? row.n : 0;
}

export async function countByTag(db, tagId, now = nowIso()) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM articles a JOIN article_tags t ON t.article_id = a.id WHERE ${VISIBLE} AND t.tag_id = ?`)
    .bind(now, tagId)
    .first();
  return row ? row.n : 0;
}

export function getArticleTags(db, articleId) {
  return all(
    db
      .prepare(`SELECT t.id, t.name, t.slug FROM tags t JOIN article_tags at ON at.tag_id = t.id WHERE at.article_id = ? ORDER BY t.name`)
      .bind(articleId),
  );
}

// ---- 投票 ------------------------------------------------------------------

export async function getVoteCounts(db, articleId) {
  const row = await db.prepare(`SELECT calm_count AS calm, rough_count AS rough FROM articles WHERE id = ?`).bind(articleId).first();
  return { calm: row?.calm || 0, rough: row?.rough || 0 };
}

export async function getMyVote(db, articleId, voter) {
  if (!voter) return null;
  const row = await db.prepare(`SELECT choice FROM votes WHERE article_id = ? AND voter = ?`).bind(articleId, voter).first();
  return row ? row.choice : null;
}

export async function countOtherVotesFromIp(db, articleId, ipHash, voter) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM votes WHERE article_id = ? AND ip_hash = ? AND voter != ?`)
    .bind(articleId, ipHash, voter)
    .first();
  return row ? row.n : 0;
}

export function upsertVote(db, { articleId, voter, ipHash, choice }) {
  const now = nowIso();
  return db
    .prepare(
      `INSERT INTO votes (article_id, voter, ip_hash, choice, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (article_id, voter) DO UPDATE SET choice = excluded.choice, ip_hash = excluded.ip_hash, updated_at = excluded.updated_at`,
    )
    .bind(articleId, voter, ipHash, choice, now, now)
    .run();
}

export const deleteVote = (db, articleId, voter) =>
  db.prepare(`DELETE FROM votes WHERE article_id = ? AND voter = ?`).bind(articleId, voter).run();

// 記事の表に持たせている投票数を、その記事の票から数え直す
export const refreshVoteCounts = (db, articleId) =>
  db
    .prepare(
      `UPDATE articles SET
         calm_count  = (SELECT COUNT(*) FROM votes WHERE article_id = ?1 AND choice = 'calm'),
         rough_count = (SELECT COUNT(*) FROM votes WHERE article_id = ?1 AND choice = 'rough')
       WHERE id = ?1`,
    )
    .bind(articleId)
    .run();

// ---- 管理画面 --------------------------------------------------------------

export function adminListArticles(db, filter, now = nowIso()) {
  const where = {
    draft: `a.status = 'draft'`,
    scheduled: `a.status = 'published' AND a.published_at > ?`,
    published: `a.status = 'published' AND a.published_at <= ?`,
    unpublished: `a.status = 'unpublished'`,
  }[filter];
  const sql = `SELECT ${ARTICLE_COLUMNS} ${FROM} ${where ? `WHERE ${where}` : ''} ORDER BY COALESCE(a.published_at, a.updated_at) DESC, a.id DESC LIMIT 200`;
  const stmt = db.prepare(sql);
  return all(where && where.includes('?') ? stmt.bind(now) : stmt);
}

export const adminGetArticle = (db, id) =>
  db.prepare(`SELECT ${ARTICLE_COLUMNS} ${FROM} WHERE a.id = ?`).bind(id).first();

export const listAllPlaces = (db) => all(db.prepare(`SELECT * FROM places ORDER BY name`));
export const listAllTags = (db) => all(db.prepare(`SELECT * FROM tags ORDER BY name`));

export async function insertTerm(db, table, name, slug) {
  const res = await db.prepare(`INSERT INTO ${table} (name, slug) VALUES (?, ?)`).bind(name, slug).run();
  return res.meta?.last_row_id;
}

export const updateTerm = (db, table, id, name, slug) =>
  db.prepare(`UPDATE ${table} SET name = ?, slug = ? WHERE id = ?`).bind(name, slug, id).run();

export const deleteTerm = (db, table, id) => db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();

export const findTermByName = (db, table, name) => db.prepare(`SELECT * FROM ${table} WHERE name = ?`).bind(name).first();
export const findTermBySlug = (db, table, slug) => db.prepare(`SELECT * FROM ${table} WHERE slug = ?`).bind(slug).first();

export async function termUsage(db, table, id) {
  const sql =
    table === 'places'
      ? `SELECT COUNT(*) AS n FROM articles WHERE place_id = ?`
      : `SELECT COUNT(*) AS n FROM article_tags WHERE tag_id = ?`;
  const row = await db.prepare(sql).bind(id).first();
  return row ? row.n : 0;
}

export async function insertArticle(db) {
  const now = nowIso();
  const res = await db
    .prepare(`INSERT INTO articles (status, created_at, updated_at) VALUES ('draft', ?, ?)`)
    .bind(now, now)
    .run();
  return res.meta?.last_row_id;
}

export function updateArticle(db, id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  return db
    .prepare(`UPDATE articles SET ${sets}, updated_at = ? WHERE id = ?`)
    .bind(...keys.map((k) => fields[k]), nowIso(), id)
    .run();
}

export const clearOtherTop = (db, id) => db.prepare(`UPDATE articles SET is_top = 0 WHERE id != ? AND is_top = 1`).bind(id).run();

export async function setArticleTags(db, articleId, tagIds) {
  const stmts = [db.prepare(`DELETE FROM article_tags WHERE article_id = ?`).bind(articleId)];
  for (const tagId of tagIds) {
    stmts.push(db.prepare(`INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)`).bind(articleId, tagId));
  }
  await db.batch(stmts);
}

export const deleteArticle = (db, id) => db.prepare(`DELETE FROM articles WHERE id = ?`).bind(id).run();

// 記事ID（YYYYMMDD-NN）を採番
export async function nextPublicId(db, publishedAtIso) {
  const key = jstDateKey(publishedAtIso);
  const row = await db
    .prepare(`SELECT public_id FROM articles WHERE public_id LIKE ? ORDER BY public_id DESC LIMIT 1`)
    .bind(`${key}-%`)
    .first();
  const n = row ? parseInt(row.public_id.slice(9), 10) + 1 : 1;
  if (n > 99) throw new Error('1日に公開できる記事は99本までです');
  return `${key}-${String(n).padStart(2, '0')}`;
}
