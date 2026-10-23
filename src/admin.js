// 管理画面（/admin/）の処理
import { htmlResponse } from './lib/html.js';
import * as auth from './lib/auth.js';
import { sanitizeBody } from './lib/sanitize.js';
import { nowIso, jstLocalToIso, isoToJstLocal, jstDateKey } from './lib/time.js';
import * as db from './db.js';
import { adminLayout, listView, formView, termsView, loginPage, editorScripts } from './views/admin.js';
import { articlePage } from './views/pages.js';
import { putPhoto, deletePhoto, hasPhotoStore, PHOTO_TYPES, MAX_PHOTO_BYTES } from './photos.js';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const FLASH = {
  save: '保存しました。',
  publish: '公開しました。',
  schedule: '予約しました。',
  unpublish: '非公開にしました。',
  deleted: '記事を削除しました。',
  added: '追加しました。',
  updated: '保存しました。',
  removed: '削除しました。',
};

function page(res, status = 200) {
  return htmlResponse(res, {
    status,
    headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' },
  });
}

const redirect = (url, path) => new Response(null, { status: 303, headers: { location: `${url.origin}${path}` } });

export async function handleAdmin(context, url) {
  const { request, env } = context;
  if (!env.DB) return new Response('D1 データベースがつながっていません（バインディング名 DB）。', { status: 500 });

  const path = url.pathname;
  const method = request.method;

  if (path === '/admin/login/') return login(env, url, request);
  if (path === '/admin/logout/' && method === 'POST') {
    return new Response(null, { status: 303, headers: { location: `${url.origin}/admin/login/?out=1`, 'set-cookie': auth.clearCookie(url) } });
  }

  const user = await auth.getAdminUser(request, env);
  if (!user) {
    if (method !== 'GET') return page(loginPage({ error: 'ログインの有効期限が切れました。もう一度ログインしてください。' }), 401);
    return redirect(url, `/admin/login/?next=${encodeURIComponent(path + url.search)}`);
  }

  const flash = FLASH[url.searchParams.get('done')] || '';
  let m;

  if (path === '/admin/' && method === 'GET') {
    const filter = url.searchParams.get('status') || '';
    const articles = await db.adminListArticles(env.DB, filter);
    return page(adminLayout({ title: '記事一覧', active: 'list', user, flash, body: listView({ articles, filter }) }));
  }

  if (path === '/admin/articles/new/') {
    if (method === 'GET') return renderForm(env, user, null, emptyValues(), {}, flash);
    if (method === 'POST') return saveArticle(env, url, user, request, null);
  }

  if ((m = path.match(/^\/admin\/articles\/(\d+)\/$/))) {
    const article = await db.adminGetArticle(env.DB, Number(m[1]));
    if (!article) return page(adminLayout({ title: '見つかりません', user, body: '記事が見つかりません。' }), 404);
    if (method === 'GET') {
      const tags = await db.getArticleTags(env.DB, article.id);
      return renderForm(env, user, article, valuesFromArticle(article, tags), {}, flash);
    }
    if (method === 'POST') return saveArticle(env, url, user, request, article);
  }

  if ((m = path.match(/^\/admin\/articles\/(\d+)\/delete\/$/)) && method === 'POST') {
    const article = await db.adminGetArticle(env.DB, Number(m[1]));
    if (article) {
      try {
        await db.deleteArticle(env.DB, article);
      } catch (err) {
        console.error(err);
        return page(
          adminLayout({
            title: '削除できませんでした',
            user,
            body: '記事を削除できませんでした。D1 のコンソールで migrations/0004_retired_ids.sql を実行してから、もう一度お試しください。',
          }),
          500,
        );
      }
      if (article.image_key) await deletePhoto(env, article.image_key);
    }
    return redirect(url, '/admin/?done=deleted');
  }

  if (path === '/admin/preview/' && method === 'POST') return preview(env, url, request);

  if ((m = path.match(/^\/admin\/(places|tags)\/$/))) {
    if (method === 'GET') return renderTerms(env, user, m[1], {}, {}, flash);
    if (method === 'POST') return addTerm(env, url, user, request, m[1]);
  }
  if ((m = path.match(/^\/admin\/(places|tags)\/(\d+)\/$/)) && method === 'POST') {
    return editTerm(env, url, user, request, m[1], Number(m[2]));
  }

  return page(adminLayout({ title: '見つかりません', user, body: 'ページが見つかりません。' }), 404);
}

// ---- ログイン --------------------------------------------------------------

const safeNext = (value) => (/^\/admin\/[^\s\\]*$/.test(value || '') && !String(value).startsWith('/admin/login') ? value : '/admin/');

async function login(env, url, request) {
  if (!auth.passwordConfigured(env)) {
    return page(loginPage({ notConfigured: true, minLength: auth.MIN_PASSWORD_LENGTH }), 503);
  }

  if (request.method === 'GET') {
    if (await auth.getAdminUser(request, env)) return redirect(url, '/admin/');
    const info = url.searchParams.get('out') ? 'ログアウトしました。' : '';
    return page(loginPage({ next: safeNext(url.searchParams.get('next')), info }));
  }
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const form = await request.formData();
  const next = safeNext(String(form.get('next') || ''));
  const ipHash = await auth.ipHashOf(request, env);

  if (await auth.isLockedOut(env.DB, ipHash)) {
    return page(loginPage({ next, error: `パスワードを何度も間違えたため、${auth.LOCKOUT_MINUTES}分ほどログインできません。時間をおいてお試しください。` }), 429);
  }

  if (!(await auth.checkPassword(env, form.get('password')))) {
    await auth.recordFailure(env.DB, ipHash);
    return page(loginPage({ next, error: 'パスワードが違います。' }), 401);
  }

  await auth.clearFailures(env.DB, ipHash);
  return new Response(null, {
    status: 303,
    headers: { location: `${url.origin}${next}`, 'set-cookie': await auth.sessionCookie(env, url), 'cache-control': 'no-store' },
  });
}

// ---- 記事フォーム ----------------------------------------------------------

function emptyValues() {
  return { title: '', body_html: '', place_id: '', tag_ids: [], image_caption: '', is_top: false, publish_at: '' };
}

function valuesFromArticle(a, tags) {
  return {
    title: a.title,
    body_html: a.body_html,
    place_id: a.place_id || '',
    tag_ids: tags.map((t) => t.id),
    image_caption: a.image_caption,
    is_top: !!a.is_top,
    publish_at: a.status === 'published' && a.published_at > nowIso() ? isoToJstLocal(a.published_at) : '',
  };
}

async function renderForm(env, user, article, values, errors, flash = '', status = 200) {
  const [places, tags] = await Promise.all([db.listAllPlaces(env.DB), db.listAllTags(env.DB)]);
  return page(
    adminLayout({
      title: article ? '記事の編集' : '新しい記事',
      active: article ? 'list' : 'new',
      user,
      flash,
      body: formView({ article, values, places, tags, errors }),
      scripts: editorScripts,
    }),
    status,
  );
}

function readForm(form) {
  const s = (k) => String(form.get(k) ?? '').trim();
  return {
    action: s('action') || 'save',
    title: s('title'),
    body_html: String(form.get('body_html') ?? ''),
    place_id: s('place_id'),
    new_place_name: s('new_place_name'),
    new_place_slug: s('new_place_slug').toLowerCase(),
    tag_ids: form.getAll('tag_ids').map(Number).filter(Boolean),
    new_tag_name: s('new_tag_name'),
    new_tag_slug: s('new_tag_slug').toLowerCase(),
    image_caption: s('image_caption'),
    is_top: form.get('is_top') === '1',
    remove_image: form.get('remove_image') === '1',
    publish_at: s('publish_at'),
    image: form.get('image'),
  };
}

// 新しい地名・タグを解決（同名があればそれを使う）
async function resolveTerm(env, table, name, slug, errors, key) {
  if (!name && !slug) return null;
  if (!name) return void (errors[key] = '名前を入力してください。');
  const existing = await db.findTermByName(env.DB, table, name);
  if (existing) return existing.id;
  if (!SLUG_RE.test(slug) || slug.length > 60) return void (errors[key] = 'URL用ローマ字は半角の小文字・数字・ハイフンで入力してください。');
  if (await db.findTermBySlug(env.DB, table, slug)) return void (errors[key] = `URL用ローマ字「${slug}」はすでに使われています。`);
  return null; // バリデーションが通ったら後で作成
}

async function saveArticle(env, url, user, request, article) {
  const form = await request.formData();
  const v = readForm(form);
  const errors = {};
  const now = nowIso();
  const body = await sanitizeBody(v.body_html);
  v.body_html = body;

  const action = ['save', 'publish', 'schedule', 'unpublish'].includes(v.action) ? v.action : 'save';
  const wasVisible = article && article.status === 'published' && article.published_at <= now;

  if (v.title.length > 200) errors.title = '見出しは200文字までです。';
  if (action === 'publish' || action === 'schedule') {
    if (!v.title) errors.title = '公開するには見出しが必要です。';
    if (!body) errors.body_html = '公開するには本文が必要です。';
  }

  let scheduledIso = null;
  if (action === 'schedule') {
    scheduledIso = jstLocalToIso(v.publish_at);
    if (wasVisible) errors.publish_at = 'すでに公開中の記事は予約できません。';
    else if (!scheduledIso) errors.publish_at = '予約日時を入力してください。';
    else if (scheduledIso <= now) errors.publish_at = '予約日時は未来の日時にしてください。';
  }

  const placeExisting = await resolveTerm(env, 'places', v.new_place_name, v.new_place_slug, errors, 'new_place');
  const tagExisting = await resolveTerm(env, 'tags', v.new_tag_name, v.new_tag_slug, errors, 'new_tag');

  const file = v.image && typeof v.image === 'object' && v.image.size > 0 ? v.image : null;
  if (file) {
    if (!PHOTO_TYPES[file.type]) errors.image = '写真は JPEG・PNG・WebP のいずれかにしてください。';
    else if (file.size > MAX_PHOTO_BYTES) errors.image = '写真が大きすぎます（1MBまで）。ブラウザでの自動縮小がうまくいかなかった可能性があります。別のブラウザで試すか、小さくした写真を選んでください。';
    else if (!hasPhotoStore(env)) errors.image = '写真の保存先（D1 データベース、バインディング名 PHOTOS）がつながっていません。';
  }

  if (Object.keys(errors).length) {
    errors._ = '入力内容を確認してください。' + (file ? '（選んだ写真はもう一度選び直してください）' : '');
    return renderForm(env, user, article, v, errors, '', 422);
  }

  // 地名・タグの新規作成
  let placeId = v.place_id ? Number(v.place_id) : null;
  if (v.new_place_name) {
    placeId = placeExisting || (await db.insertTerm(env.DB, 'places', v.new_place_name, v.new_place_slug));
  }
  const tagIds = new Set(v.tag_ids);
  if (v.new_tag_name) {
    tagIds.add(tagExisting || (await db.insertTerm(env.DB, 'tags', v.new_tag_name, v.new_tag_slug)));
  }

  const id = article ? article.id : await db.insertArticle(env.DB);
  const current = article || { status: 'draft', published_at: null, public_id: null, image_key: null };

  // 公開状態の決定
  let status = current.status;
  let publishedAt = current.published_at;
  let publicId = current.public_id;

  if (action === 'publish') {
    status = 'published';
    const keepDate = current.public_id && current.published_at && current.published_at <= now;
    publishedAt = keepDate ? current.published_at : now;
  } else if (action === 'schedule') {
    status = 'published';
    publishedAt = scheduledIso;
  } else if (action === 'unpublish') {
    if (current.status === 'published' && current.published_at > now) {
      status = 'draft'; // 予約の取り消し（まだ一度も公開されていないので URL も解放）
      publishedAt = null;
      publicId = null;
    } else {
      status = 'unpublished';
    }
  }

  // 記事ID（URL）の採番。一度でも読者に公開された記事のIDは変えない。
  // 予約中でまだ誰にも見えていない記事は、公開日が変わったらIDを振り直す。
  if (status === 'published') {
    const wasEverVisible = !!(current.public_id && current.published_at && current.published_at <= now);
    if (!wasEverVisible && (!publicId || publicId.slice(0, 8) !== jstDateKey(publishedAt))) {
      if (publicId) await db.updateArticle(env.DB, id, { public_id: null });
      publicId = await db.nextPublicId(env.DB, publishedAt);
    }
  }

  // 写真
  let imageKey = current.image_key;
  if (file) {
    const key = `articles/${id}/${crypto.randomUUID()}.${PHOTO_TYPES[file.type]}`;
    await putPhoto(env, key, file);
    if (imageKey) await deletePhoto(env, imageKey);
    imageKey = key;
  } else if (v.remove_image && imageKey) {
    await deletePhoto(env, imageKey);
    imageKey = null;
  }

  await db.updateArticle(env.DB, id, {
    title: v.title,
    body_html: body,
    place_id: placeId,
    image_key: imageKey,
    image_caption: v.image_caption,
    is_top: v.is_top ? 1 : 0,
    status,
    published_at: publishedAt,
    public_id: publicId,
  });
  if (v.is_top) await db.clearOtherTop(env.DB, id);
  await db.setArticleTags(env.DB, id, [...tagIds]);

  return redirect(url, `/admin/articles/${id}/?done=${action}`);
}

async function preview(env, url, request) {
  const form = await request.formData();
  const v = readForm(form);
  const places = await db.listAllPlaces(env.DB);
  const place = places.find((p) => String(p.id) === v.place_id);
  const a = {
    id: 0,
    public_id: null,
    title: v.title,
    body_html: await sanitizeBody(v.body_html),
    image_key: v.remove_image ? null : String(form.get('existing_image_key') || '') || null,
    image_caption: v.image_caption,
    place_name: place ? place.name : v.new_place_name || null,
    place_slug: place ? place.slug : v.new_place_slug || null,
    published_at: nowIso(),
    calm: 0,
    rough: 0,
  };
  const all = await db.listAllTags(env.DB);
  const tags = all.filter((t) => v.tag_ids.includes(t.id));
  const now = nowIso();
  const [latest, ranking, sameTown] = await Promise.all([
    db.listLatest(env.DB, { limit: 5, now }),
    db.listRanking(env.DB, { now }),
    place ? db.listByPlace(env.DB, place.id, { limit: 5, now }) : [],
  ]);
  return page(articlePage({ origin: url.origin, a, tags, myVote: null, sameTown, latest, ranking, preview: true }));
}

// ---- 地名・タグ ------------------------------------------------------------

async function renderTerms(env, user, kind, errors, values, flash = '', status = 200) {
  const items = kind === 'places' ? await db.listAllPlaces(env.DB) : await db.listAllTags(env.DB);
  for (const item of items) item.usage = await db.termUsage(env.DB, kind, item.id);
  return page(
    adminLayout({
      title: kind === 'places' ? '地名' : 'タグ',
      active: kind,
      user,
      flash,
      body: termsView({ kind, items, errors, values }),
      scripts: editorScripts,
    }),
    status,
  );
}

async function validateTerm(env, kind, name, slug, selfId = 0) {
  if (!name) return '名前を入力してください。';
  if (!SLUG_RE.test(slug) || slug.length > 60) return 'URL用ローマ字は半角の小文字・数字・ハイフンで入力してください。';
  const byName = await db.findTermByName(env.DB, kind, name);
  if (byName && byName.id !== selfId) return `「${name}」はすでにあります。`;
  const bySlug = await db.findTermBySlug(env.DB, kind, slug);
  if (bySlug && bySlug.id !== selfId) return `URL用ローマ字「${slug}」はすでに使われています。`;
  return null;
}

async function addTerm(env, url, user, request, kind) {
  const form = await request.formData();
  const name = String(form.get('name') || '').trim();
  const slug = String(form.get('slug') || '').trim().toLowerCase();
  const error = await validateTerm(env, kind, name, slug);
  if (error) return renderTerms(env, user, kind, { _: error }, { name, slug }, '', 422);
  await db.insertTerm(env.DB, kind, name, slug);
  return redirect(url, `/admin/${kind}/?done=added`);
}

async function editTerm(env, url, user, request, kind, id) {
  const form = await request.formData();
  if (form.get('action') === 'delete') {
    if ((await db.termUsage(env.DB, kind, id)) === 0) await db.deleteTerm(env.DB, kind, id);
    return redirect(url, `/admin/${kind}/?done=removed`);
  }
  const name = String(form.get('name') || '').trim();
  const slug = String(form.get('slug') || '').trim().toLowerCase();
  const error = await validateTerm(env, kind, name, slug, id);
  if (error) return renderTerms(env, user, kind, { _: error }, {}, '', 422);
  await db.updateTerm(env.DB, kind, id, name, slug);
  return redirect(url, `/admin/${kind}/?done=updated`);
}
