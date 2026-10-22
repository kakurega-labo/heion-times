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
          heading: { levels: [2] },
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
      editorProps: { attributes: { class: 'editor__content', 'aria-multiline': 'true', role: 'textbox' } },
      onUpdate: () => {
        syncTextarea();
        markDirty();
      },
      onSelectionUpdate: updateToolbar,
      onTransaction: updateToolbar,
    });

    textarea.hidden = true;
    if (note) note.hidden = true;
    surface.hidden = false;
    toolbar.hidden = false;
    updateToolbar();
  } catch (err) {
    console.error('エディタを読み込めませんでした', err);
    if (note) note.textContent = 'エディタを読み込めなかったため、HTMLで直接書く欄を表示しています（<p>段落</p>、<h2>小見出し</h2> など）。';
    textarea.addEventListener('input', markDirty);
  }

  function syncTextarea() {
    if (!editor) return;
    textarea.value = editor.isEmpty ? '' : editor.getHTML();
  }

  function updateToolbar() {
    if (!editor) return;
    const state = {
      h2: editor.isActive('heading', { level: 2 }),
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

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cmd]');
    if (!button || !editor) return;
    const chain = editor.chain().focus();
    switch (button.dataset.cmd) {
      case 'h2':
        chain.toggleHeading({ level: 2 }).run();
        break;
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'quote':
        chain.toggleBlockquote().run();
        break;
      case 'undo':
        chain.undo().run();
        break;
      case 'redo':
        chain.redo().run();
        break;
      case 'link': {
        if (editor.isActive('link')) {
          chain.extendMarkRange('link').unsetLink().run();
          break;
        }
        const href = window.prompt('リンク先のURLを入力してください（https:// から）', 'https://');
        if (!href || href === 'https://') break;
        if (!/^(https?:\/\/|mailto:|\/)/.test(href)) {
          window.alert('https:// で始まるURLを入力してください。');
          break;
        }
        chain.extendMarkRange('link').setLink({ href }).run();
        break;
      }
    }
  });

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
    if (storage) storage.removeItem(draftKey);
  });

  window.addEventListener('beforeunload', (event) => {
    if (dirty && !submitting) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}
