// 平穏タイムズ本体：URLごとに処理を振り分けます。
import { htmlResponse } from './lib/html.js';
import { nowIso } from './lib/time.js';
import * as db from './db.js';
import * as pages from './views/pages.js';
import { tagsBox, rankingBox, calmPercent, LEVELS } from './views/components.js';
import { handleAdmin } from './admin.js';
import { servePhoto } from './photos.js';

const PER_PAGE = 30;
const VOTE_COOKIE = 'hv';
const MAX_VOTES_PER_IP = 10; // 同じ回線から1記事に入れられる票の上限（家族や職場で同じ回線を使う分を考慮）

export async function handle(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    // URLの末尾スラッシュをそろえる（/articles/xxx → /articles/xxx/）
    if ((method === 'GET' || method === 'HEAD') && !path.endsWith('/') && !/\.[a-z0-9]+$/i.test(path) && !path.startsWith('/images/')) {
      return Response.redirect(`${url.origin}${path}/${url.search}`, 301);
    }

    if (method === 'POST' && !isSameOrigin(request, url)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (path === '/admin/' || path.startsWith('/admin/')) return await handleAdmin(context, url);
    if (path.startsWith('/images/')) return await servePhoto(env, path.slice('/images/'.length), request);

    if (!env.DB) return setupNeeded();

    let m;
    if (path === '/' && method === 'GET') return await home(env, url);
    if (path === '/articles/' && method === 'GET') return await allArticles(env, url);
    if ((m = path.match(/^\/articles\/(\d{8}-\d{2})\/$/)) && method === 'GET') return await article(env, url, request, m[1]);
    if ((m = path.match(/^\/articles\/(\d{8}-\d{2})\/vote\/$/)) && method === 'POST') return await vote(env, url, request, m[1]);
    if (path === '/places/' && method === 'GET') return await placesIndex(env, url);
    if (path === '/tags/' && method === 'GET') return await tagsIndex(env, url);
    if ((m = path.match(/^\/ranking\/([a-z]+)\/$/)) && method === 'GET') return await levelPage(env, url, m[1]);
    if ((m = path.match(/^\/places\/([a-z0-9-]+)\/$/)) && method === 'GET') return await placePage(env, url, m[1]);
    if ((m = path.match(/^\/tags\/([a-z0-9-]+)\/$/)) && method === 'GET') return await tagPage(env, url, m[1]);
    if (path === '/ranking/' && method === 'GET') return await rankingPage(env, url);
    if (path === '/about/' && method === 'GET') return htmlResponse(pages.aboutPage({ origin: url.origin }));

    // それ以外は静的ファイル（/assets/ など）。なければ 404。
    const res = await context.next();
    if (res.status === 404) return notFound(url);
    return res;
  } catch (err) {
    console.error(err);
    return new Response('エラーが発生しました。時間をおいてもう一度お試しください。', {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}

function isSameOrigin(request, url) {
  const origin = request.headers.get('origin');
  if (origin) return origin === url.origin;
  const site = request.headers.get('sec-fetch-site');
  return !site || site === 'same-origin' || site === 'none';
}

const notFound = (url) => htmlResponse(pages.notFoundPage({ origin: url.origin, path: url.pathname }), { status: 404 });

function setupNeeded() {
  return new Response('D1 データベースがつながっていません。README の「D1 をつなぐ」を確認してください（バインディング名は DB）。', {
    status: 500,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

const pageParam = (url) => Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);

async function sideBoxes(env, now, { ranking: withRanking = true } = {}) {
  const [ranking, tags] = await Promise.all([withRanking ? db.listRanking(env.DB, { now }) : [], db.listTagsWithCounts(env.DB, now)]);
  return [withRanking ? rankingBox(ranking) : '', tagsBox(tags)];
}

// ---- 読者側 ----------------------------------------------------------------

async function home(env, url) {
  const now = nowIso();
  const top = await db.getTopArticle(env.DB, now);
  const [latest, ranking, tags] = await Promise.all([
    db.listLatest(env.DB, { limit: 11, excludeId: top ? top.id : 0, now }),
    db.listRanking(env.DB, { now }),
    db.listTagsWithCounts(env.DB, now),
  ]);
  return htmlResponse(
    pages.homePage({ origin: url.origin, top, latest: latest.slice(0, 10), hasMore: latest.length > 10, ranking, tags }),
  );
}

async function allArticles(env, url) {
  const now = nowIso();
  const page = pageParam(url);
  const [articles, total, side] = await Promise.all([
    db.listLatest(env.DB, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE, now }),
    db.countVisible(env.DB, now),
    sideBoxes(env, now),
  ]);
  if (page > 1 && !articles.length) return notFound(url);
  return htmlResponse(
    pages.listPage({ origin: url.origin, path: '/articles/', nav: 'latest', title: 'すべてのニュース', heading: 'すべてのニュース', articles, page, total, perPage: PER_PAGE, side }),
  );
}

async function article(env, url, request, publicId) {
  const now = nowIso();
  const a = await db.getVisibleArticle(env.DB, publicId, now);
  if (!a) return notFound(url);
  const voter = readCookie(request, VOTE_COOKIE);
  const [tags, myVote, sameTown, latest, ranking] = await Promise.all([
    db.getArticleTags(env.DB, a.id),
    db.getMyVote(env.DB, a.id, voter),
    a.place_id ? db.listByPlace(env.DB, a.place_id, { limit: 5, excludeId: a.id, now }) : [],
    db.listLatest(env.DB, { limit: 5, excludeId: a.id, now }),
    db.listRanking(env.DB, { now }),
  ]);
  return htmlResponse(pages.articlePage({ origin: url.origin, a, tags, myVote, sameTown, latest, ranking }), {
    headers: { 'cache-control': 'no-store' },
  });
}

async function placesIndex(env, url) {
  const places = await db.listPlacesWithCounts(env.DB);
  return htmlResponse(pages.placesIndexPage({ origin: url.origin, places }));
}

async function placePage(env, url, slug) {
  const now = nowIso();
  const place = await db.getPlaceBySlug(env.DB, slug);
  if (!place) return notFound(url);
  const page = pageParam(url);
  const [articles, total, side] = await Promise.all([
    db.listByPlace(env.DB, place.id, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE, now }),
    db.countByPlace(env.DB, place.id, now),
    sideBoxes(env, now),
  ]);
  return htmlResponse(
    pages.listPage({
      origin: url.origin, path: `/places/${slug}/`, nav: '', title: `${place.name}のニュース`,
      heading: `${place.name}のニュース`, lead: `${place.name}で起きた出来事 ${total}件`,
      articles, page, total, perPage: PER_PAGE, showPlace: false, side,
    }),
  );
}

async function tagPage(env, url, slug) {
  const now = nowIso();
  const tag = await db.getTagBySlug(env.DB, slug);
  if (!tag) return notFound(url);
  const page = pageParam(url);
  const [articles, total, side] = await Promise.all([
    db.listByTag(env.DB, tag.id, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE, now }),
    db.countByTag(env.DB, tag.id, now),
    sideBoxes(env, now),
  ]);
  return htmlResponse(
    pages.listPage({
      origin: url.origin, path: `/tags/${slug}/`, nav: 'tags', title: `「${tag.name}」のニュース`,
      heading: `「${tag.name}」のニュース`, lead: `${total}件`, articles, page, total, perPage: PER_PAGE, side,
    }),
  );
}

async function tagsIndex(env, url) {
  const tags = await db.listTagsWithCounts(env.DB);
  return htmlResponse(pages.tagsIndexPage({ origin: url.origin, tags }));
}

async function rankingPage(env, url) {
  const now = nowIso();
  const [ranking, side] = await Promise.all([db.listRanking(env.DB, { limit: 20, now }), sideBoxes(env, now, { ranking: false })]);
  return htmlResponse(pages.rankingPage({ origin: url.origin, ranking, side }));
}

async function levelPage(env, url, slug) {
  const level = LEVELS.find((l) => l.slug === slug);
  if (!level) return notFound(url);
  const now = nowIso();
  const page = pageParam(url);
  const [articles, total, side] = await Promise.all([
    db.listByLevel(env.DB, level.min, level.max, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE, now }),
    db.countByLevel(env.DB, level.min, level.max, now),
    sideBoxes(env, now),
  ]);
  if (page > 1 && !articles.length) return notFound(url);
  return htmlResponse(pages.levelPage({ origin: url.origin, level, articles, page, total, perPage: PER_PAGE, side }));
}

// ---- 投票 ------------------------------------------------------------------

function readCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookie);
  return m && /^[0-9a-f-]{36}$/.test(m[1]) ? m[1] : null;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function vote(env, url, request, publicId) {
  const wantsJson = (request.headers.get('accept') || '').includes('application/json');
  const a = await db.getVisibleArticle(env.DB, publicId);
  if (!a) return wantsJson ? Response.json({ error: 'not_found' }, { status: 404 }) : notFound(url);

  const form = await request.formData();
  const choice = form.get('choice');
  if (choice !== 'calm' && choice !== 'rough') {
    return wantsJson ? Response.json({ error: 'bad_choice' }, { status: 400 }) : Response.redirect(`${url.origin}/articles/${publicId}/#vote`, 303);
  }

  let voter = readCookie(request, VOTE_COOKIE);
  const isNewVoter = !voter;
  if (!voter) voter = crypto.randomUUID();

  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const ipHash = (await sha256Hex(`${env.VOTE_SALT || 'heion-times'}:${ip}`)).slice(0, 32);

  const current = await db.getMyVote(env.DB, a.id, voter);
  let myVote = null;
  let error = null;

  if (current === choice) {
    await db.deleteVote(env.DB, a.id, voter); // 同じボタンをもう一度押したら取り消し
  } else if (!current && (await db.countOtherVotesFromIp(env.DB, a.id, ipHash, voter)) >= MAX_VOTES_PER_IP) {
    error = 'この回線からの投票が多すぎるため、受け付けられませんでした';
    myVote = null;
  } else {
    await db.upsertVote(env.DB, { articleId: a.id, voter, ipHash, choice });
    myVote = choice;
  }
  if (!error) await db.refreshVoteCounts(env.DB, a.id);

  const headers = new Headers();
  if (isNewVoter) {
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    headers.append('set-cookie', `${VOTE_COOKIE}=${voter}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${secure}`);
  }

  if (wantsJson) {
    const counts = await db.getVoteCounts(env.DB, a.id);
    headers.set('cache-control', 'no-store');
    return Response.json(
      { ...counts, total: counts.calm + counts.rough, pct: calmPercent(counts.calm, counts.rough), choice: myVote, error },
      { status: error ? 429 : 200, headers },
    );
  }
  headers.set('location', `${url.origin}/articles/${publicId}/#vote`);
  return new Response(null, { status: 303, headers });
}
