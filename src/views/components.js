import { html } from '../lib/html.js';
import { formatListTime } from '../lib/time.js';

export const articleUrl = (a) => `/articles/${a.public_id}/`;
export const placeUrl = (slug) => `/places/${slug}/`;
export const tagUrl = (slug) => `/tags/${slug}/`;
export const imageUrl = (key) => `/images/${key}`;

export function calmPercent(calm, rough) {
  const total = (calm || 0) + (rough || 0);
  return total ? Math.round((calm / total) * 100) : null;
}

export const flatIcon = (cls = 'icon') =>
  html`<svg class="${cls} icon--calm" viewBox="0 0 20 12" aria-hidden="true"><line x1="1" y1="6" x2="19" y2="6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

export const waveIcon = (cls = 'icon') =>
  html`<svg class="${cls} icon--rough" viewBox="0 0 20 12" aria-hidden="true"><path d="M 1 6 Q 5.5 0 10 6 T 19 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

// 平穏度の表示（50%以上は水平線、50%未満は波線）
export function score(a, { bar = false } = {}) {
  const pct = calmPercent(a.calm, a.rough);
  if (pct === null) return html`<span class="score score--none">平穏度 —</span>`;
  return html`<span class="score">${pct >= 50 ? flatIcon() : waveIcon()}<span>平穏度 ${pct}%</span>${
    bar ? html`<span class="bar" aria-hidden="true"><span style="width:${pct}%"></span></span>` : ''
  }</span>`;
}

export function articleRow(a, { showPlace = true } = {}) {
  return html`<li class="row${showPlace ? '' : ' row--noplace'}">
    <span class="row__time"><time datetime="${a.published_at}">${formatListTime(a.published_at)}</time></span>
    ${!showPlace ? '' : a.place_slug ? html`<a class="row__place" href="${placeUrl(a.place_slug)}">${a.place_name}</a>` : html`<span class="row__place"></span>`}
    <a class="row__title" href="${articleUrl(a)}">${a.title}</a>
    <span class="row__score">${score(a)}</span>
  </li>`;
}

export function articleList(articles, opts) {
  if (!articles.length) return html`<p class="empty">まだ記事はありません。きょうも平穏です。</p>`;
  return html`<ul class="rows">${articles.map((a) => articleRow(a, opts))}</ul>`;
}

export function rankingBox(ranking, { heading = '今週もっとも平穏ではなかったニュース', id = 'ranking-h' } = {}) {
  return html`<section class="box" aria-labelledby="${id}">
    <h2 class="box__title" id="${id}">${heading}</h2>
    ${
      ranking.length
        ? html`<ol class="ranking">${ranking.map(
            (a, i) => html`<li class="ranking__item">
              <span class="ranking__rank">${i + 1}</span>
              <span class="ranking__body">
                <a href="${articleUrl(a)}">${a.title}</a>
                <span class="meta">${a.place_name ? html`${a.place_name}　` : ''}平穏ではない ${100 - calmPercent(a.calm, a.rough)}%</span>
              </span>
            </li>`,
          )}</ol>`
        : html`<p class="empty">今週は、おおむね平穏でした。</p>`
    }
  </section>`;
}

export function placesBox(places) {
  return html`<section class="box" aria-labelledby="places-h">
    <h2 class="box__title" id="places-h">地名から探す</h2>
    ${
      places.length
        ? html`<ul class="place-list">${places.map(
            (p) => html`<li><a href="${placeUrl(p.slug)}"><span>${p.name}</span><span class="meta">${p.count}件</span></a></li>`,
          )}</ul>`
        : html`<p class="empty">まだありません。</p>`
    }
  </section>`;
}

export function pager(page, total, perPage, basePath) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return '';
  const link = (p) => (p <= 1 ? basePath : `${basePath}?page=${p}`);
  return html`<nav class="pager" aria-label="ページ送り">
    ${page > 1 ? html`<a href="${link(page - 1)}" rel="prev">新しい記事</a>` : html`<span></span>`}
    <span class="meta">${page} / ${pages}</span>
    ${page < pages ? html`<a href="${link(page + 1)}" rel="next">過去の記事</a>` : html`<span></span>`}
  </nav>`;
}
