import { html, raw } from '../lib/html.js';
import { formatDateTime, isoToJstLocal, nowIso } from '../lib/time.js';
import { calmPercent, imageUrl } from './components.js';

const FONTS = 'https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@800&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap';

const MENU = [
  { key: 'list', href: '/admin/', label: '記事一覧' },
  { key: 'new', href: '/admin/articles/new/', label: '新しい記事' },
  { key: 'places', href: '/admin/places/', label: '地名' },
  { key: 'tags', href: '/admin/tags/', label: 'タグ' },
];

export function adminLayout({ title, active = '', user, body, flash = '', scripts = '' }) {
  return html`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} | 平穏タイムズ 管理画面</title>
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/assets/style.css">
<link rel="stylesheet" href="/assets/admin.css">
</head>
<body class="admin">
<header class="admin-header">
  <div class="admin-header__inner">
    <a class="admin-brand" href="/admin/"><span class="admin-brand__name">平穏タイムズ</span><span class="admin-brand__tag">管理画面</span></a>
    <nav class="admin-nav" aria-label="管理メニュー">
      ${MENU.map((m) => html`<a href="${m.href}"${m.key === active ? html` aria-current="page"` : ''}>${m.label}</a>`)}
      <a href="/" target="_blank" rel="noopener">サイトを見る</a>
    </nav>
    <form method="post" action="/admin/logout/" class="admin-logout">
      <button type="submit">ログアウト</button>
    </form>
  </div>
</header>
<main class="admin-main">
${flash ? html`<p class="flash" role="status">${flash}</p>` : ''}
${body}
</main>
${scripts}
</body>
</html>`;
}

export function statusInfo(a, now = nowIso()) {
  if (a.status === 'published' && a.published_at > now) return { key: 'scheduled', label: '予約' };
  if (a.status === 'published') return { key: 'published', label: '公開中' };
  if (a.status === 'unpublished') return { key: 'unpublished', label: '非公開' };
  return { key: 'draft', label: '下書き' };
}

const FILTERS = [
  { key: '', label: 'すべて' },
  { key: 'draft', label: '下書き' },
  { key: 'scheduled', label: '予約' },
  { key: 'published', label: '公開中' },
  { key: 'unpublished', label: '非公開' },
];

export function listView({ articles, filter }) {
  return html`<div class="admin-title-row">
      <h1 class="admin-title">記事一覧</h1>
      <a class="btn btn--primary" href="/admin/articles/new/">新しい記事を書く</a>
    </div>
    <nav class="filter" aria-label="状態で絞り込み">
      ${FILTERS.map((f) => html`<a href="/admin/${f.key ? `?status=${f.key}` : ''}"${f.key === filter ? html` aria-current="page"` : ''}>${f.label}</a>`)}
    </nav>
    ${
      articles.length
        ? html`<div class="table-wrap"><table class="table table--articles">
            <thead><tr><th>見出し</th><th>地名</th><th>状態</th><th>日時</th><th>平穏度</th><th></th></tr></thead>
            <tbody>${articles.map((a) => {
              const st = statusInfo(a);
              const pct = calmPercent(a.calm, a.rough);
              const title = a.title || '（見出しなし）';
              return html`<tr>
                <td class="table__title"><div class="table__title-inner"><a href="/admin/articles/${a.id}/" title="${title}">${title}</a>${a.is_top ? html`<span class="badge badge--top">トップ</span>` : ''}</div></td>
                <td class="table__place">${a.place_name || '—'}</td>
                <td class="table__status"><span class="badge badge--${st.key}">${st.label}</span></td>
                <td class="table__date nowrap">${a.published_at ? formatDateTime(a.published_at) : formatDateTime(a.updated_at)}</td>
                <td class="table__score nowrap">${pct === null ? '—' : `${pct}%（${a.calm + a.rough}票）`}</td>
                <td class="table__view nowrap">${st.key === 'published' ? html`<a href="/articles/${a.public_id}/" target="_blank" rel="noopener">表示</a>` : ''}</td>
              </tr>`;
            })}</tbody>
          </table></div>`
        : html`<p class="empty">記事はまだありません。</p>`
    }`;
}

const field = (errors, name) => (errors[name] ? html`<p class="field-error" id="${name}-error">${errors[name]}</p>` : '');

export function formView({ article, values, places, tags, errors = {} }) {
  const a = article;
  const isNew = !a;
  const st = a ? statusInfo(a) : { key: 'new', label: '未保存' };
  const v = values;
  const action = isNew ? '/admin/articles/new/' : `/admin/articles/${a.id}/`;
  const selectedTags = new Set((v.tag_ids || []).map(String));
  const visible = st.key === 'published';
  const scheduled = st.key === 'scheduled';

  const publishButtons = visible
    ? html`<button class="btn btn--primary" type="submit" name="action" value="save">更新を保存</button>
           <button class="btn btn--danger" type="submit" name="action" value="unpublish">非公開にする</button>`
    : html`<button class="btn" type="submit" name="action" value="save">${scheduled ? '保存' : '下書き保存'}</button>
           <button class="btn btn--primary" type="submit" name="action" value="publish">${st.key === 'unpublished' ? '再公開する' : '今すぐ公開'}</button>
           <div class="schedule">
             <label for="publish_at">予約日時（日本時間）</label>
             <input type="datetime-local" id="publish_at" name="publish_at" value="${v.publish_at || ''}">
             <button class="btn" type="submit" name="action" value="schedule">${scheduled ? '予約日時を変更' : '予約公開'}</button>
           </div>
           ${field(errors, 'publish_at')}
           ${scheduled ? html`<button class="btn btn--danger" type="submit" name="action" value="unpublish">予約を取り消す</button>` : ''}`;

  const body = html`<div class="admin-title-row">
      <h1 class="admin-title">${isNew ? '新しい記事' : '記事の編集'}</h1>
      <span class="badge badge--${st.key}">${st.label}</span>
      ${visible ? html`<a href="/articles/${a.public_id}/" target="_blank" rel="noopener">公開ページを見る</a>` : ''}
    </div>
    ${errors._ ? html`<p class="flash flash--error" role="alert">${errors._}</p>` : ''}
    <form class="article-form" method="post" action="${action}" enctype="multipart/form-data" data-article-form data-draft-key="heion-draft-${isNew ? 'new' : a.id}" data-updated-at="${a ? a.updated_at : ''}">
      <input type="hidden" name="existing_image_key" value="${a?.image_key || ''}">
      <div class="article-form__main">
        <div class="field">
          <label for="title">見出し</label>
          <input type="text" id="title" name="title" value="${v.title || ''}" maxlength="200" autocomplete="off" placeholder="例：町営バス、終バスが2分早まる"${errors.title ? html` aria-invalid="true" aria-describedby="title-error"` : ''}>
          ${field(errors, 'title')}
        </div>
        <div class="field">
          <span class="label" id="body-label">本文</span>
          <div class="editor" data-editor-root>
            <div class="editor__toolbar" role="toolbar" aria-label="本文の書式" data-toolbar hidden>
              <button type="button" data-cmd="p" aria-pressed="false">本文</button>
              <button type="button" data-cmd="h2" aria-pressed="false">見出し</button>
              <button type="button" data-cmd="h3" aria-pressed="false">小見出し</button>
              <span class="editor__sep" aria-hidden="true"></span>
              <button type="button" data-cmd="bold" aria-pressed="false"><b>太字</b></button>
              <button type="button" data-cmd="link" aria-pressed="false">リンク</button>
              <button type="button" data-cmd="quote" aria-pressed="false">引用</button>
              <span class="editor__sep" aria-hidden="true"></span>
              <button type="button" data-cmd="undo">元に戻す</button>
              <button type="button" data-cmd="redo">やり直す</button>
            </div>
            <div class="editor__surface article__body" data-editor aria-labelledby="body-label" hidden></div>
            <textarea class="editor__fallback" name="body_html" id="body_html" rows="16" aria-labelledby="body-label">${v.body_html || ''}</textarea>
            <p class="hint" data-editor-fallback-note>エディタを読み込み中です。表示されない場合は、ここにHTML（&lt;p&gt;段落&lt;/p&gt;）で直接書けます。</p>
          </div>
          ${field(errors, 'body_html')}
        </div>
        <div class="restore" data-restore hidden>
          <span>このブラウザに、保存されていない書きかけが残っています。</span>
          <button type="button" class="btn" data-restore-yes>復元する</button>
          <button type="button" class="btn btn--ghost" data-restore-no>破棄する</button>
        </div>
      </div>

      <aside class="article-form__side">
        <section class="panel">
          <h2 class="panel__title">公開</h2>
          ${a?.public_id ? html`<p class="hint">URL：/articles/${a.public_id}/</p>` : html`<p class="hint">URLは初めて公開するときに自動で決まります。</p>`}
          <div class="panel__actions">${publishButtons}</div>
          <button class="btn btn--ghost" type="submit" formaction="/admin/preview/" formtarget="_blank" formnovalidate>プレビュー</button>
          <p class="hint" data-autosave-status></p>
        </section>

        <section class="panel">
          <h2 class="panel__title">地名</h2>
          <div class="field">
            <label for="place_id">地名を選ぶ</label>
            <select id="place_id" name="place_id">
              <option value="">選ばない</option>
              ${places.map((p) => html`<option value="${p.id}"${String(v.place_id) === String(p.id) ? html` selected` : ''}>${p.name}（${p.slug}）</option>`)}
            </select>
          </div>
          <details${v.new_place_name || errors.new_place ? html` open` : ''}>
            <summary>新しい地名を追加</summary>
            <div class="field">
              <label for="new_place_name">地名</label>
              <input type="text" id="new_place_name" name="new_place_name" value="${v.new_place_name || ''}" placeholder="例：鴨沼町">
            </div>
            <div class="field">
              <label for="new_place_slug">URL用ローマ字</label>
              <input type="text" id="new_place_slug" name="new_place_slug" value="${v.new_place_slug || ''}" placeholder="例：kamonuma" pattern="[a-z0-9-]+" inputmode="url" autocapitalize="off">
              <p class="hint">半角の小文字・数字・ハイフンのみ。/places/kamonuma/ のようになります。</p>
            </div>
            ${field(errors, 'new_place')}
          </details>
        </section>

        <section class="panel">
          <h2 class="panel__title">タグ</h2>
          ${
            tags.length
              ? html`<div class="checks">${tags.map(
                  (t) => html`<label class="check"><input type="checkbox" name="tag_ids" value="${t.id}"${selectedTags.has(String(t.id)) ? html` checked` : ''}> ${t.name}</label>`,
                )}</div>`
              : html`<p class="hint">タグはまだありません。</p>`
          }
          <details${v.new_tag_name || errors.new_tag ? html` open` : ''}>
            <summary>新しいタグを追加</summary>
            <div class="field">
              <label for="new_tag_name">タグ名</label>
              <input type="text" id="new_tag_name" name="new_tag_name" value="${v.new_tag_name || ''}" placeholder="例：バス">
            </div>
            <div class="field">
              <label for="new_tag_slug">URL用ローマ字</label>
              <input type="text" id="new_tag_slug" name="new_tag_slug" value="${v.new_tag_slug || ''}" placeholder="例：bus" pattern="[a-z0-9-]+" inputmode="url" autocapitalize="off">
            </div>
            ${field(errors, 'new_tag')}
          </details>
        </section>

        <section class="panel">
          <h2 class="panel__title">写真（見出しの下に1枚）</h2>
          ${
            a?.image_key
              ? html`<img class="panel__image" src="${imageUrl(a.image_key)}" alt="">
                     <label class="check"><input type="checkbox" name="remove_image" value="1"> 写真を外す</label>`
              : ''
          }
          <div class="field">
            <label for="image">${a?.image_key ? '写真を差し替える' : '写真を選ぶ'}</label>
            <input type="file" id="image" name="image" accept="image/jpeg,image/png,image/webp,.heic,.heif" data-photo-input>
            <p class="hint" data-photo-status>JPEG・PNG・WebP・HEIC（iPhoneの写真）。選ぶと自動で縮小（長辺1600px）してから保存します。横長（16:9）がきれいに表示されます。</p>
            <img class="panel__image" data-photo-preview alt="" hidden>
          </div>
          ${field(errors, 'image')}
          <div class="field">
            <label for="image_caption">写真の説明（キャプション）</label>
            <input type="text" id="image_caption" name="image_caption" value="${v.image_caption || ''}" maxlength="200" placeholder="例：改正後の時刻表が貼り出された停留所（22日）">
          </div>
        </section>

        <section class="panel">
          <h2 class="panel__title">トップ記事</h2>
          <label class="check"><input type="checkbox" name="is_top" value="1"${v.is_top ? html` checked` : ''}> この記事をトップ記事にする</label>
          <p class="hint">ほかの記事のトップ指定は自動で外れます。</p>
        </section>
        ${
          a
            ? html`<section class="panel panel--danger" aria-labelledby="danger-h">
                <h2 class="panel__title" id="danger-h">記事の削除</h2>
                ${
                  a.public_id
                    ? html`<p class="hint">削除すると元に戻せません。URL（/articles/${a.public_id}/）は「この記事は削除されました」の表示になり、投票の記録も消えます。一時的に隠したいだけなら「非公開にする」を使ってください。</p>`
                    : html`<p class="hint">削除すると元に戻せません。</p>`
                }
                <button class="btn btn--danger" type="submit" form="delete-article" formnovalidate>この記事を削除</button>
              </section>`
            : ''
        }
      </aside>
    </form>
    ${
      a
        ? html`<form id="delete-article" method="post" action="/admin/articles/${a.id}/delete/" data-confirm="${
            a.public_id
              ? `「${a.title || '（見出しなし）'}」を削除します。\nURLは見られなくなり、投票の記録も消えます。元に戻せません。よろしいですか？`
              : `この下書きを削除します。元に戻せません。よろしいですか？`
          }" hidden></form>`
        : ''
    }`;
  return body;
}

export function termsView({ kind, items, errors = {}, values = {} }) {
  const label = kind === 'places' ? '地名' : 'タグ';
  const base = `/admin/${kind}/`;
  const prefix = kind === 'places' ? '/places/' : '/tags/';
  return html`<div class="admin-title-row"><h1 class="admin-title">${label}</h1></div>
    ${errors._ ? html`<p class="flash flash--error" role="alert">${errors._}</p>` : ''}
    <section class="panel panel--wide">
      <h2 class="panel__title">${label}を追加</h2>
      <form class="inline-form" method="post" action="${base}">
        <div class="field"><label for="name">${label}</label><input type="text" id="name" name="name" value="${values.name || ''}" required></div>
        <div class="field"><label for="slug">URL用ローマ字</label><input type="text" id="slug" name="slug" value="${values.slug || ''}" required pattern="[a-z0-9-]+" autocapitalize="off"></div>
        <button class="btn btn--primary" type="submit">追加</button>
      </form>
      <p class="hint">URL用ローマ字は半角の小文字・数字・ハイフンのみ。一度公開した後に変えると、古いURLは見られなくなります。</p>
    </section>
    ${
      items.length
        ? html`<ul class="term-list">${items.map(
            (t) => html`<li class="term">
              <form class="term__form" method="post" action="${base}${t.id}/">
                <label class="term__field"><span class="term__label">${label}</span>
                  <input type="text" name="name" value="${t.name}" required></label>
                <label class="term__field"><span class="term__label">URL用ローマ字</span>
                  <input type="text" name="slug" value="${t.slug}" required pattern="[a-z0-9-]+" autocapitalize="off"></label>
                <div class="term__actions">
                  <button class="btn" type="submit" name="action" value="update">保存</button>
                  ${t.usage === 0 ? html`<button class="btn btn--danger btn--ghost" type="submit" name="action" value="delete">削除</button>` : ''}
                </div>
              </form>
              <div class="term__meta">
                <span>記事 ${t.usage}件</span>
                <a href="${prefix}${t.slug}/" target="_blank" rel="noopener">サイトで見る</a>
              </div>
            </li>`,
          )}</ul>`
        : html`<p class="empty">まだありません。</p>`
    }`;
}

export function loginPage({ next = '/admin/', error = '', info = '', notConfigured = false, minLength = 16 } = {}) {
  return html`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>ログイン | 平穏タイムズ 管理画面</title>
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@800&amp;family=Zen+Kaku+Gothic+New:wght@400;500;700&amp;display=swap">
<link rel="stylesheet" href="/assets/style.css"><link rel="stylesheet" href="/assets/admin.css"></head>
<body class="admin admin--login"><main class="login">
<div class="login__brand"><span class="login__name">平穏タイムズ</span><span class="admin-brand__tag">管理画面</span></div>
${
  notConfigured
    ? html`<div class="login__box">
        <h1 class="admin-title">管理画面のパスワードが未設定です</h1>
        <p>Cloudflare Pages の <strong>設定 → 変数とシークレット</strong> に、シークレット <code>ADMIN_PASSWORD</code>（${minLength}文字以上）を追加して、再デプロイしてください。</p>
        <p><a href="/">サイトのトップへ</a></p>
      </div>`
    : html`<form class="login__box" method="post" action="/admin/login/">
        <h1 class="admin-title">ログイン</h1>
        ${info ? html`<p class="flash" role="status">${info}</p>` : ''}
        ${error ? html`<p class="flash flash--error" role="alert">${error}</p>` : ''}
        <input type="hidden" name="next" value="${next}">
        <input type="text" name="username" value="admin" autocomplete="username" hidden>
        <div class="field">
          <label for="password">パスワード</label>
          <input type="password" id="password" name="password" required autocomplete="current-password" autofocus>
        </div>
        <button class="btn btn--primary" type="submit">ログイン</button>
        <p class="hint">ログインは30日間保持されます。</p>
      </form>`
}
<p class="login__back"><a href="/">サイトのトップへ戻る</a></p>
</main></body></html>`;
}

export const editorScripts = raw(`<script type="module" src="/assets/admin-editor.js"></script>`);
