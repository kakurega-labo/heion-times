// Cloudflare Pages Functions の入口。すべてのリクエストを src/app.js に渡します。
// （/assets/ などの静的ファイルは public/_routes.json の設定でここを通らずに配信されます）
import { handle } from '../src/app.js';

export const onRequest = (context) => handle(context);
