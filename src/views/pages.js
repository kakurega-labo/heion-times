import { html, raw, excerpt } from '../lib/html.js';
import { formatDateTime, formatMonthDay } from '../lib/time.js';
import { layout, SITE_NAME, CATCHCOPY } from './layout.js';
import {
  articleUrl, placeUrl, tagUrl, imageUrl, score, articleList, rankingBox, tagsBox, pager,
  calmPercent, flatIcon, waveIcon, LEVELS,
} from './components.js';

// ---- トップページ ----------------------------------------------------------

export function homePage({ origin, top, latest, ranking, tags, hasMore }) {
  const topBlock = top
    ? html`<article class="lead">
        ${top.image_key ? html`<a class="lead__image" href="${articleUrl(top)}" tabindex="-1"><img src="${imageUrl(top.image_key)}" alt="${top.image_caption || ''}" width="1200" height="675"></a>` : ''}
        <div class="meta-line">
          ${top.place_slug ? html`<a class="place" href="${placeUrl(top.place_slug)}">${top.place_name}</a>` : ''}
          <time datetime="${top.published_at}">${formatDateTime(top.published_at)}</time>
        </div>
        <h1 class="lead__title"><a href="${articleUrl(top)}">${top.title}</a></h1>
        <p class="lead__text">${excerpt(top.body_html, 110)}</p>
        ${score(top, { bar: true })}
      </article>`
    : html`<div class="lead lead--empty"><h1 class="lead__title">${CATCHCOPY}</h1><p>まだ記事はありません。</p></div>`;

  const body = html`<div class="columns">
    <div class="columns__main">
      ${topBlock}
      <section aria-labelledby="latest-h">
        <h2 class="section-title" id="latest-h">最新ニュース</h2>
        ${articleList(latest)}
        ${hasMore ? html`<a class="button-outline" href="/articles/?page=2">もっと見る</a>` : ''}
      </section>
    </div>
    <aside class="columns__side">
      ${rankingBox(ranking)}
      ${tagsBox(tags)}
    </aside>
  </div>`;

  return layout({ origin, path: '/', nav: 'latest', body });
}

// ---- 記事ページ ------------------------------------------------------------

export function voteSection(a, myVote) {
  const pct = calmPercent(a.calm, a.rough);
  const total = (a.calm || 0) + (a.rough || 0);
  const status = myVote
    ? `「${myVote === 'calm' ? 'これは平穏' : '平穏ではない'}」に投票しました。押し直すと取り消せます`
    : 'まだ投票していません';
  const btn = (choice, label, icon) =>
    html`<button type="submit" name="choice" value="${choice}" class="vote__btn vote__btn--${choice}" aria-pressed="${myVote === choice ? 'true' : 'false'}">${icon('icon icon--lg')}<span>${label}</span></button>`;

  return html`<section class="vote" id="vote" aria-labelledby="vote-h">
    <h2 class="vote__title" id="vote-h">このニュースは平穏でしたか？</h2>
    <form method="post" action="${articleUrl(a)}vote/" class="vote__form" data-vote>
      ${btn('calm', 'これは平穏', flatIcon)}
      ${btn('rough', '平穏ではない', waveIcon)}
    </form>
    <div class="vote__result">
      <div class="vote__summary">
        <span><strong data-vote-pct>${pct === null ? '平穏度 —' : `平穏度 ${pct}%`}</strong>　<span class="meta">（<span data-vote-total>${total}</span>票）</span></span>
        <span class="meta" aria-live="polite" data-vote-status>${status}</span>
      </div>
      <span class="vote__bar" aria-hidden="true"><span data-vote-bar style="width:${pct === null ? 50 : pct}%"></span></span>
      <div class="vote__counts meta"><span>平穏 <span data-vote-calm>${a.calm || 0}</span>票</span><span>平穏ではない <span data-vote-rough>${a.rough || 0}</span>票</span></div>
    </div>
  </section>`;
}

export function articlePage({ origin, a, tags, myVote, sameTown, latest, ranking, preview = false }) {
  const path = a.public_id ? articleUrl(a) : '/preview/';
  const body = html`<div class="columns">
    <div class="columns__main">
      <article class="article">
        <nav class="crumbs" aria-label="現在地">
          <a href="/">トップ</a><span aria-hidden="true">›</span>
          ${a.place_slug ? html`<a href="${placeUrl(a.place_slug)}">${a.place_name}</a>` : html`<span>記事</span>`}
        </nav>
        <header class="article__head">
          <div class="meta-line">
            ${a.place_slug ? html`<a class="place" href="${placeUrl(a.place_slug)}">${a.place_name}</a>` : ''}
            ${a.published_at ? html`<time datetime="${a.published_at}">${formatDateTime(a.published_at)}</time>` : html`<span>（公開前）</span>`}
          </div>
          <h1 class="article__title">${a.title || '（見出し未入力）'}</h1>
        </header>
        ${
          a.image_key
            ? html`<figure class="article__figure">
                <img src="${imageUrl(a.image_key)}" alt="${a.image_caption || ''}" width="1200" height="675">
                ${a.image_caption ? html`<figcaption>${a.image_caption}</figcaption>` : ''}
              </figure>`
            : ''
        }
        <div class="article__body">${raw(a.body_html)}</div>
        ${
          tags.length
            ? html`<ul class="tags" aria-label="タグ">${tags.map((t) => html`<li><a href="${tagUrl(t.slug)}">${t.name}</a></li>`)}</ul>`
            : ''
        }
      </article>
      ${preview ? html`<p class="empty">（プレビューでは投票はできません）</p>` : voteSection(a, myVote)}
      ${
        a.place_slug
          ? html`<section aria-labelledby="town-h">
              <h2 class="section-title" id="town-h">${a.place_name}のほかのニュース</h2>
              ${sameTown.length ? articleList(sameTown, { showPlace: false }) : html`<p class="empty">ほかのニュースはまだありません。</p>`}
              <a class="button-outline" href="${placeUrl(a.place_slug)}">${a.place_name}のニュースをすべて見る</a>
            </section>`
          : ''
      }
    </div>
    <aside class="columns__side">
      <section class="box" aria-labelledby="side-latest-h">
        <h2 class="box__title" id="side-latest-h">最新ニュース</h2>
        <ul class="side-list">${latest.map(
          (x) => html`<li><a href="${articleUrl(x)}">${x.title}</a><span class="meta">${x.place_name ? html`${x.place_name}　` : ''}${formatMonthDay(x.published_at)}</span></li>`,
        )}</ul>
      </section>
      ${rankingBox(ranking, { id: 'side-ranking-h' })}
    </aside>
  </div>
  ${preview ? '' : html`<script src="/assets/vote.js" defer></script>`}`;

  return layout({
    origin,
    path,
    title: a.title,
    description: excerpt(a.body_html, 110),
    image: a.image_key ? imageUrl(a.image_key) : null,
    type: 'article',
    body,
    noindex: preview,
    banner: preview ? html`<div class="preview-banner">プレビュー表示です。まだ保存・公開されていません。</div>` : '',
  });
}

// ---- 一覧ページ（全記事・地名・タグ） --------------------------------------

export function listPage({ origin, path, nav = '', title, heading, lead = '', articles, page, total, perPage, showPlace = true, side }) {
  const body = html`<div class="columns">
    <div class="columns__main">
      <div class="page-head">
        <h1 class="page-title">${heading}</h1>
        ${lead ? html`<p class="page-lead">${lead}</p>` : ''}
      </div>
      ${articleList(articles, { showPlace })}
      ${pager(page, total, perPage, path)}
    </div>
    <aside class="columns__side">${side}</aside>
  </div>`;
  return layout({ origin, path: page > 1 ? `${path}?page=${page}` : path, nav, title, body });
}

export function placesIndexPage({ origin, places }) {
  const body = html`<h1 class="page-title">地名一覧</h1>
    <p class="page-lead">平穏タイムズに登場した町の一覧です。</p>
    ${
      places.length
        ? html`<ul class="place-grid">${places.map(
            (p) => html`<li><a href="${placeUrl(p.slug)}"><span class="place-grid__name">${p.name}</span><span class="meta">${p.count}件</span></a></li>`,
          )}</ul>`
        : html`<p class="empty">まだありません。</p>`
    }`;
  return layout({ origin, path: '/places/', nav: 'places', title: '地名一覧', body });
}

export function tagsIndexPage({ origin, tags }) {
  const body = html`<h1 class="page-title">話題</h1>
    <p class="page-lead">読みたい話題を選んでください。</p>
    ${
      tags.length
        ? html`<ul class="place-grid">${tags.map(
            (t) => html`<li><a href="${tagUrl(t.slug)}"><span class="place-grid__name">${t.name}</span><span class="meta">${t.count}件</span></a></li>`,
          )}</ul>`
        : html`<p class="empty">まだありません。</p>`
    }`;
  return layout({ origin, path: '/tags/', nav: 'tags', title: '話題', body });
}

function rankingTabs(active) {
  const tabs = [{ slug: '', label: '今週のランキング' }, ...LEVELS];
  return html`<nav class="tabs" aria-label="ランキングの種類">
    ${tabs.map(
      (t) => html`<a href="/ranking/${t.slug ? `${t.slug}/` : ''}"${t.slug === active ? html` aria-current="page"` : ''}>${
        t.slug === 'major' ? waveIcon() : t.slug === 'calm' ? flatIcon() : ''
      }${t.label}</a>`,
    )}
  </nav>`;
}

export function levelPage({ origin, level, articles, page, total, perPage, side }) {
  const path = `/ranking/${level.slug}/`;
  const body = html`<div class="columns">
    <div class="columns__main">
      <div class="page-head">
        <h1 class="page-title">ランキング</h1>
        ${rankingTabs(level.slug)}
        <p class="page-lead">${level.note}（${level.range}）。新しい順に${total}件。</p>
      </div>
      ${articleList(articles)}
      ${pager(page, total, perPage, path)}
    </div>
    <aside class="columns__side">${side}</aside>
  </div>`;
  return layout({ origin, path: page > 1 ? `${path}?page=${page}` : path, nav: 'ranking', title: `${level.label}のニュース`, body });
}

export function rankingPage({ origin, ranking, side }) {
  const body = html`<div class="columns">
    <div class="columns__main">
      <div class="page-head">
        <h1 class="page-title">ランキング</h1>
        ${rankingTabs('')}
        <p class="page-lead">直近7日間に公開された記事のうち、読者の投票で「平穏ではない」の割合が高かったニュースです。</p>
      </div>
      ${rankingBox(ranking, { heading: '今週一番平穏ではなかったニュース', id: 'rank-page-h' })}
    </div>
    <aside class="columns__side">${side}</aside>
  </div>`;
  return layout({ origin, path: '/ranking/', nav: 'ranking', title: 'ランキング', body });
}

export function aboutPage({ origin }) {
  const body = html`<article class="article about">
    <h1 class="page-title">平穏タイムズについて</h1>
    <div class="article__body">
      <p>${SITE_NAME}は、どこかの町で起きた、ささいな出来事を大真面目にお伝えするニュースサイトです。</p>
      <p>終バスが2分早まった、池のカモが1羽増えた、商店街の福引で今年も特賞が出なかった。世の中を揺るがすことはないけれど、町の平穏がほんの少し揺れた出来事を、毎日お届けします。</p>
      <h2>平穏度について</h2>
      <p>各記事の最後で、読者のみなさんに「これは平穏」「平穏ではない」のどちらかを選んでいただいています。その割合が「平穏度」です。平穏度が低い記事ほど、町にとっては大事件です。</p>
      <h2>ご注意</h2>
      <p>掲載記事には架空の出来事が含まれます。</p>
    </div>
  </article>`;
  return layout({ origin, path: '/about/', nav: 'about', title: '平穏タイムズについて', body });
}

export function deletedPage({ origin, path }) {
  const body = html`<div class="notfound">
    <h1 class="page-title">この記事は削除されました</h1>
    <p>この記事は、編集部の判断で削除されました。ほかのニュースは、おおむね平穏に掲載中です。</p>
    <a class="button-outline" href="/">トップへ戻る</a>
  </div>`;
  return layout({ origin, path, title: 'この記事は削除されました', body, noindex: true });
}

export function notFoundPage({ origin, path }) {
  const body = html`<div class="notfound">
    <h1 class="page-title">お探しのページは見つかりませんでした</h1>
    <p>記事が非公開になったか、URLが変わった可能性があります。それ以外は、おおむね平穏です。</p>
    <a class="button-outline" href="/">トップへ戻る</a>
  </div>`;
  return layout({ origin, path, title: 'ページが見つかりません', body, noindex: true });
}
