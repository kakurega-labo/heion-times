// 本文HTMLのサニタイズ（許可したタグ以外を取り除く）。
// 見たままエディタで使えるもの（本文・見出し・小見出し・太字・リンク・引用・改行）だけを残します。
// Cloudflare 上では HTMLRewriter を使い、それがない環境（ローカルのテスト）では
// 簡易版で代用します。

const ALLOWED = new Set(['p', 'h2', 'h3', 'strong', 'b', 'a', 'blockquote', 'br']);
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript',
  'svg', 'math', 'textarea', 'select', 'button', 'form', 'input', 'head', 'title', 'link', 'meta',
]);

export function safeHref(href) {
  const value = String(href || '').trim();
  if (!value) return null;
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (/^(\/(?!\/)|#)/.test(value)) return value; // サイト内リンク
  return null; // javascript: などは許可しない
}

const isExternal = (href) => /^https?:/i.test(href);

export async function sanitizeBody(input) {
  const source = String(input || '').trim();
  if (!source) return '';
  if (typeof HTMLRewriter === 'undefined') return fallbackSanitize(source);

  const rewriter = new HTMLRewriter()
    .on('*', {
      element(el) {
        const tag = el.tagName.toLowerCase();
        if (DROP_WITH_CONTENT.has(tag)) {
          el.remove();
          return;
        }
        if (!ALLOWED.has(tag)) {
          el.removeAndKeepContent();
          return;
        }
        const href = tag === 'a' ? safeHref(el.getAttribute('href')) : null;
        for (const [name] of [...el.attributes]) el.removeAttribute(name);
        if (tag === 'a') {
          if (!href) {
            el.removeAndKeepContent();
            return;
          }
          el.setAttribute('href', href);
          if (isExternal(href)) el.setAttribute('rel', 'nofollow noopener');
        }
      },
    })
    .onDocument({
      comments(comment) {
        comment.remove();
      },
      doctype() {},
    });

  const out = await rewriter.transform(new Response(source)).text();
  return out.trim();
}

// ローカルテスト用の簡易サニタイズ（本番では使われません）
function fallbackSanitize(source) {
  let s = source.replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of DROP_WITH_CONTENT) {
    s = s.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
    s = s.replace(new RegExp(`<${tag}\\b[^>]*>`, 'gi'), '');
  }
  return s
    .replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, name, attrs) => {
      const tag = name.toLowerCase();
      if (!ALLOWED.has(tag)) return '';
      if (match.startsWith('</')) return `</${tag}>`;
      if (tag === 'a') {
        const m = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
        const href = safeHref(m ? m[2] ?? m[3] : '');
        if (!href) return '<a>';
        const rel = isExternal(href) ? ' rel="nofollow noopener"' : '';
        return `<a href="${href.replace(/"/g, '&quot;')}"${rel}>`;
      }
      return `<${tag}>`;
    })
    .trim();
}
