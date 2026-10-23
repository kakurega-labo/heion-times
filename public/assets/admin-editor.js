// 管理画面のスクリプト：見たままエディタ（Tiptap）と、書きかけの一時保存。
// Tiptap は CDN（esm.sh）から読み込みます。読み込めなかった場合は、
// 本文欄がそのままHTMLを書けるテキスト欄として使えます。

// 削除などの確認ダイアログ
document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  });
});

const form = document.querySelector('[data-article-form]');
if (form) setupArticleForm(form);

// ---- 写真の自動縮小 ----
// 写真は D1 に保存するため、送る前にブラウザで小さくします（長辺1600px、なるべく400KB以下）。
const photoInput = document.querySelector('[data-photo-input]');
if (photoInput) setupPhotoInput(photoInput);

function setupPhotoInput(input) {
  const status = document.querySelector('[data-photo-status]');
  const preview = document.querySelector('[data-photo-preview]');
  const MAX_SIDE = 1600;
  const TARGET = 400 * 1024;
  const LIMIT = 1000 * 1024;
  const kb = (n) => `${Math.round(n / 1024)}KB`;

  const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

  const isHeic = (file) => /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

  // HEIC（iPhoneの写真形式）をJPEGに変換する。必要なときだけ変換用の部品を読み込む。
  async function heicToJpeg(file) {
    status.textContent = 'iPhoneの写真形式（HEIC）を変換しています…';
    const { heicTo } = await import('https://esm.sh/heic-to@1');
    return heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
  }

  async function decode(file) {
    // Safari など HEIC をそのまま読めるブラウザでは変換しない
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (err) {
      if (!isHeic(file)) throw err;
    }
    return createImageBitmap(await heicToJpeg(file), { imageOrientation: 'from-image' });
  }

  async function shrink(file) {
    const bitmap = await decode(file);
    let side = MAX_SIDE;
    let best = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // 透過PNGの背景を白に
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.7, 0.6]) {
        let blob = await toBlob(canvas, 'image/webp', quality);
        if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality); // WebP非対応のブラウザ
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= TARGET) return blob;
      }
      side = Math.round(side * 0.8);
    }
    return best;
  }

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (typeof createImageBitmap !== 'function' || typeof DataTransfer !== 'function') {
      if (file.size > LIMIT) status.textContent = `この写真は ${kb(file.size)} あり、1MBを超えています。小さくしてから選んでください。`;
      return;
    }
    status.textContent = '写真を縮小しています…';
    try {
      const blob = await shrink(file);
      if (blob.size > LIMIT) {
        input.value = '';
        status.textContent = `縮小しても ${kb(blob.size)} あり、保存できません。別の写真を選んでください。`;
        return;
      }
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext;
      const dt = new DataTransfer();
      dt.items.add(new File([blob], name, { type: blob.type }));
      input.files = dt.files;
      status.textContent = `縮小しました：${kb(file.size)} → ${kb(blob.size)}。保存すると反映されます。`;
      if (preview) {
        preview.src = URL.createObjectURL(blob);
        preview.hidden = false;
      }
    } catch (err) {
      console.error(err);
      input.value = '';
      status.textContent = isHeic(file)
        ? 'HEIC形式の写真を変換できませんでした。通信状態を確認してもう一度選ぶか、iPhoneから直接選んでください。'
        : 'この写真は読み込めませんでした。JPEG・PNG・WebP・HEICの写真を選んでください。';
    }
  });
}

async function setupArticleForm(form) {
  const textarea = form.querySelector('#body_html');
  const titleInput = form.querySelector('#title');
  const surface = form.querySelector('[data-editor]');
  const toolbar = form.querySelector('[data-toolbar]');
  const note = form.querySelector('[data-editor-fallback-note]');
  const statusEl = form.querySelector('[data-autosave-status]');
  const draftKey = form.dataset.draftKey;
  let editor = null;
  let dirty = false;
  let submitting = false;

  // ---- エディタ ----
  try {
    const [{ Editor }, { default: StarterKit }] = await Promise.all([
      import('https://esm.sh/@tiptap/core@3'),
      import('https://esm.sh/@tiptap/starter-kit@3'),
    ]);

    editor = new Editor({
      element: surface,
      content: textarea.value,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] }, // 見出し（h2）・小見出し（h3）
          link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: null, target: null } },
          bulletList: false,
          orderedList: false,
          listItem: false,
          listKeymap: false,
          codeBlock: false,
          code: false,
          italic: false,
          strike: false,
          underline: false,
          horizontalRule: false,
        }),
      ],
      editorProps: {
        attributes: { class: 'editor__content', 'aria-multiline': 'true', role: 'textbox' },
        // カーソルが枠の端にくっつかないよう、少し余白を取ってスクロールする
        scrollMargin: { top: 24, bottom: 32, left: 0, right: 0 },
        scrollThreshold: { top: 24, bottom: 32, left: 0, right: 0 },
      },
      onUpdate: () => {
        syncTextarea();
        markDirty();
      },
      onSelectionUpdate: updateToolbar,
      onTransaction: updateToolbar,
      onFocus: () => setEditing(true),
      onBlur: () => setTimeout(() => setEditing(editor && editor.isFocused), 150),
    });

    textarea.hidden = true;
    if (note) note.hidden = true;
    surface.hidden = false;
    toolbar.hidden = false;
    updateToolbar();
  } catch (err) {
    console.error('エディタを読み込めませんでした', err);
    if (note) note.textContent = 'エディタを読み込めなかったため、HTMLで直接書く欄を表示しています（<p>本文</p>、<h2>見出し</h2>、<h3>小見出し</h3> など）。';
    textarea.addEventListener('input', markDirty);
  }

  function syncTextarea() {
    if (!editor) return;
    textarea.value = editor.isEmpty ? '' : editor.getHTML();
  }

  function updateToolbar() {
    if (!editor) return;
    const h2 = editor.isActive('heading', { level: 2 });
    const h3 = editor.isActive('heading', { level: 3 });
    const state = {
      p: !h2 && !h3 && editor.isActive('paragraph'),
      h2,
      h3,
      bold: editor.isActive('bold'),
      link: editor.isActive('link'),
      quote: editor.isActive('blockquote'),
    };
    toolbar.querySelectorAll('[data-cmd]').forEach((b) => {
      if (b.dataset.cmd in state) b.setAttribute('aria-pressed', String(state[b.dataset.cmd]));
    });
    toolbar.querySelector('[data-cmd="undo"]').disabled = !editor.can().undo();
    toolbar.querySelector('[data-cmd="redo"]').disabled = !editor.can().redo();
  }

  // ボタンを押しても入力欄からフォーカスが外れない（スマホでキーボードが閉じない）ようにする
  toolbar.addEventListener('pointerdown', (event) => {
    if (event.target.closest('[data-cmd]')) event.preventDefault();
  });
  toolbar.addEventListener('mousedown', (event) => {
    if (event.target.closest('[data-cmd]')) event.preventDefault();
  });

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cmd]');
    if (!button || !editor || button.disabled) return;
    const run = () => editor.chain().focus();
    switch (button.dataset.cmd) {
      case 'p':
        run().setParagraph().run();
        break;
      case 'h2':
        run().toggleHeading({ level: 2 }).run();
        break;
      case 'h3':
        run().toggleHeading({ level: 3 }).run();
        break;
      case 'bold':
        run().toggleBold().run();
        break;
      case 'quote':
        run().toggleBlockquote().run();
        break;
      case 'undo':
        run().undo().run();
        break;
      case 'redo':
        run().redo().run();
        break;
      case 'link': {
        if (editor.isActive('link')) {
          run().extendMarkRange('link').unsetLink().run();
          break;
        }
        const href = window.prompt('リンク先のURLを入力してください（https:// から）', 'https://');
        if (!href || href === 'https://') {
          editor.commands.focus();
          break;
        }
        if (!/^(https?:\/\/|mailto:|\/)/.test(href)) {
          window.alert('https:// で始まるURLを入力してください。');
          editor.commands.focus();
          break;
        }
        run().extendMarkRange('link').setLink({ href }).run();
        break;
      }
    }
  });

  // ---- 編集枠の大きさ ----
  // ツールバーはいつも編集枠のいちばん上にあり、本文は枠の中でスクロールする。
  // スマホで入力中は、キーボードの上の見えている範囲にちょうど収まるよう枠の高さを合わせる。
  const editorRoot = form.querySelector('[data-editor-root]');
  const touchQuery = window.matchMedia('(hover: none) and (pointer: coarse)');
  const vv = window.visualViewport;
  let editing = false;
  let fitTimer = 0;

  function setEditing(on) {
    if (editing === !!on) return;
    editing = !!on;
    editorRoot.classList.toggle('editor--editing', editing);
    if (editing) scheduleFit(true);
    else surface.style.maxHeight = '';
  }

  function scheduleFit(align) {
    if (!touchQuery.matches || !vv) return;
    clearTimeout(fitTimer);
    // キーボードが出きってから合わせる
    fitTimer = setTimeout(() => fitToViewport(align), 120);
  }

  function fitToViewport(align) {
    if (!editing) return;
    const BOTTOM_SAFE = 64; // Safari のアドレスバーなどに隠れない余白
    const available = vv.height - toolbar.offsetHeight - BOTTOM_SAFE - 8;
    surface.style.maxHeight = `${Math.max(160, Math.round(available))}px`;
    if (align) {
      const top = editorRoot.getBoundingClientRect().top - vv.offsetTop - 8;
      if (Math.abs(top) > 4) window.scrollBy({ top, behavior: 'smooth' });
    }
    // カーソルが枠の外に出ていたら枠の中で見える位置へ
    if (editor) editor.commands.scrollIntoView();
  }

  if (vv) vv.addEventListener('resize', () => editing && scheduleFit(true));
  touchQuery.addEventListener?.('change', () => editing && scheduleFit(true));

  // ---- 書きかけの一時保存（このブラウザの中だけ） ----
  const storage = (() => {
    try {
      const s = window.localStorage;
      s.setItem('__t', '1');
      s.removeItem('__t');
      return s;
    } catch {
      return null;
    }
  })();

  let timer = null;
  function markDirty() {
    dirty = true;
    if (!storage) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      syncTextarea();
      try {
        storage.setItem(draftKey, JSON.stringify({ title: titleInput.value, body: textarea.value, at: Date.now() }));
        const t = new Date();
        statusEl.textContent = `書きかけをこのブラウザに一時保存しました（${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}）`;
      } catch {
        /* 容量不足などは無視 */
      }
    }, 1500);
  }

  titleInput.addEventListener('input', markDirty);
  form.querySelectorAll('input, select').forEach((el) => el !== titleInput && el.addEventListener('change', () => (dirty = true)));

  // 保存が成功して戻ってきたとき（URLに ?done= が付く）だけ、ブラウザ内の書きかけを消す。
  // 保存に失敗した場合（ログイン切れなど）は書きかけが残るので、復元できる。
  if (storage && new URLSearchParams(location.search).has('done')) {
    storage.removeItem(draftKey);
    storage.removeItem('heion-draft-new');
  }

  if (storage) {
    try {
      const saved = JSON.parse(storage.getItem(draftKey) || 'null');
      const differs = saved && (saved.title !== titleInput.value || saved.body !== textarea.value);
      if (differs) {
        const box = form.querySelector('[data-restore]');
        box.hidden = false;
        box.querySelector('[data-restore-yes]').addEventListener('click', () => {
          titleInput.value = saved.title;
          if (editor) editor.commands.setContent(saved.body || '');
          textarea.value = saved.body || '';
          box.hidden = true;
          dirty = true;
        });
        box.querySelector('[data-restore-no]').addEventListener('click', () => {
          storage.removeItem(draftKey);
          box.hidden = true;
        });
      }
    } catch {
      /* 壊れたデータは無視 */
    }
  }

  form.addEventListener('submit', (event) => {
    syncTextarea();
    const isPreview = (event.submitter?.getAttribute('formaction') || '').includes('/preview/');
    if (isPreview) return;
    submitting = true;
    if (storage) {
      try {
        storage.setItem(draftKey, JSON.stringify({ title: titleInput.value, body: textarea.value, at: Date.now() }));
      } catch {
        /* 容量不足などは無視 */
      }
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (dirty && !submitting) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}
