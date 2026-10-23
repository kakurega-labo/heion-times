// 日時は UTC で保存し、表示や記事IDは日本時間（JST, UTC+9）で扱います。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export const nowIso = () => new Date().toISOString();

function jstParts(iso) {
  const d = new Date(new Date(iso).getTime() + JST_OFFSET_MS);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    hh: String(d.getUTCHours()).padStart(2, '0'),
    mm: String(d.getUTCMinutes()).padStart(2, '0'),
    dow: WEEKDAYS[d.getUTCDay()],
  };
}

// 記事ID用の日付（例: 20261022）
export function jstDateKey(iso) {
  const p = jstParts(iso);
  return `${p.y}${String(p.m).padStart(2, '0')}${String(p.d).padStart(2, '0')}`;
}

// ヘッダー用（例: 2026年10月22日（木））
export function formatHeaderDate(iso = nowIso()) {
  const p = jstParts(iso);
  return `${p.y}年${p.m}月${p.d}日（${p.dow}）`;
}

// 記事ページ用（例: 2026年10月22日 22:40）
export function formatDateTime(iso) {
  if (!iso) return '';
  const p = jstParts(iso);
  return `${p.y}年${p.m}月${p.d}日 ${p.hh}:${p.mm}`;
}

// 一覧用：今日なら時刻、それ以外は月日（例: 22:40 / 10月19日）
export function formatListTime(iso, now = nowIso()) {
  if (!iso) return '';
  const p = jstParts(iso);
  if (jstDateKey(iso) === jstDateKey(now)) return `${p.hh}:${p.mm}`;
  const n = jstParts(now);
  return p.y === n.y ? `${p.m}月${p.d}日` : `${p.y}年${p.m}月${p.d}日`;
}

export function formatMonthDay(iso) {
  if (!iso) return '';
  const p = jstParts(iso);
  return `${p.m}月${p.d}日`;
}

// <input type="datetime-local"> の値（JST）→ UTC ISO
export function jstLocalToIso(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - JST_OFFSET_MS;
  return new Date(utc).toISOString();
}

// UTC ISO → <input type="datetime-local"> の値（JST）
export function isoToJstLocal(iso) {
  if (!iso) return '';
  const p = jstParts(iso);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}T${p.hh}:${p.mm}`;
}

export function daysAgoIso(days, now = nowIso()) {
  return new Date(new Date(now).getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
