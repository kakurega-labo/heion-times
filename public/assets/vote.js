// 投票ボタン：ページを再読み込みせずに投票し、平穏度をその場で更新します。
// JavaScript が動かない環境でも、フォーム送信でそのまま投票できます。
(() => {
  const form = document.querySelector('[data-vote]');
  if (!form) return;
  const $ = (sel) => document.querySelector(sel);
  const buttons = form.querySelectorAll('button[name="choice"]');

  function render(data) {
    $('[data-vote-pct]').textContent = data.pct === null ? '平穏度 —' : `平穏度 ${data.pct}%`;
    $('[data-vote-total]').textContent = data.total;
    $('[data-vote-calm]').textContent = data.calm;
    $('[data-vote-rough]').textContent = data.rough;
    $('[data-vote-bar]').style.width = `${data.pct === null ? 50 : data.pct}%`;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.value === data.choice)));
    let status = 'まだ投票していません';
    if (data.choice === 'calm') status = '「これは平穏」に投票しました。押し直すと取り消せます';
    if (data.choice === 'rough') status = '「平穏ではない」に投票しました。押し直すと取り消せます';
    if (data.error) status = data.error;
    $('[data-vote-status]').textContent = status;
  }

  form.addEventListener('submit', async (event) => {
    const button = event.submitter;
    if (!button) return;
    event.preventDefault();
    const body = new FormData();
    body.set('choice', button.value);
    buttons.forEach((b) => (b.disabled = true));
    try {
      const res = await fetch(form.action, { method: 'POST', body, headers: { accept: 'application/json' }, credentials: 'same-origin' });
      const data = await res.json();
      if (data.calm === undefined) throw new Error(data.error || 'error');
      render(data);
    } catch {
      $('[data-vote-status]').textContent = '投票できませんでした。時間をおいてもう一度お試しください';
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  });
})();
