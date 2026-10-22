import { html } from '../lib/html.js';
import { formatHeaderDate } from '../lib/time.js';

export const SITE_NAME = '平穏タイムズ';
export const CATCHCOPY = 'きょうも、おおむね平穏です。';

const FONTS =
  'https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@800&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap';

const NAV = [
  { key: 'latest', href: '/', label: '最新' },
  { key: 'places', href: '/places/', label: '地名から探す' },
  { key: 'ranking', href: '/ranking/', label: 'ランキング' },
  { key: 'about', href: '/about/', label: '平穏タイムズについて' },
];

export const waveSvg = (cls = 'wordmark__wave') => html`<svg class="${cls}" viewBox="0 0 460 14" preserveAspectRatio="none" aria-hidden="true"><path d="M 2 7 Q 59 3 116 7 T 230 7 T 344 7 T 458 7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`;

export function layout({ title, description, nav = '', origin, path = '/', image, type = 'website', body, banner = '', noindex = false }) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — ${CATCHCOPY}`;
  const desc = description || `どこかの町で起きた、ささいな出来事を大真面目に報じるニュースサイト。${CATCHCOPY}`;
  const url = origin + path;
  const ogImage = image ? (image.startsWith('http') ? image : origin + image) : `${origin}/assets/ogp.png`;

  return html`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
${noindex ? html`<meta name="robots" content="noindex">` : ''}
<link rel="canonical" href="${url}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${title || SITE_NAME}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="${type}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogImage}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/assets/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
<a class="skip" href="#content">本文へ移動</a>
${banner}
<header class="site-header">
  <div class="container site-header__top">
    <a class="wordmark" href="/" aria-label="${SITE_NAME} トップへ">
      <span class="wordmark__name">${SITE_NAME}</span>
      ${waveSvg()}
    </a>
    <span class="site-header__date">${formatHeaderDate()}</span>
  </div>
  <nav class="container site-nav" aria-label="メインメニュー">
    ${NAV.map((n) => html`<a href="${n.href}"${n.key === nav ? html` aria-current="page"` : ''}>${n.label}</a>`)}
  </nav>
</header>
<main id="content" class="container">
${body}
</main>
<footer class="site-footer">
  <div class="container site-footer__inner">
    <span>${SITE_NAME}　${CATCHCOPY}</span>
    <span>掲載記事はすべて架空の出来事です。</span>
  </div>
</footer>
</body>
</html>`;
}
