(function () {
  'use strict';

  const { UNITS, audioUrl, mistakes, pitchCompare } = window.LianTailo;

  const ICON_PLAY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
  const ICON_DELETE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  const el = {
    filters: document.getElementById('filters'),
    list: document.getElementById('mistakeList'),
    empty: document.getElementById('emptyState'),
    footer: document.getElementById('footer'),
    clearBtn: document.getElementById('clearBtn'),
  };

  const audio = new Audio();
  let filter = 'all';

  const unitName = (unit) => (UNITS[unit] ? UNITS[unit].short : unit);

  function formatDate(ts) {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return '今天';
    const sameYear = d.getFullYear() === today.getFullYear();
    return `${sameYear ? '' : `${d.getFullYear()}/`}${d.getMonth() + 1}/${d.getDate()}`;
  }

  function renderFilters(all) {
    const counts = {};
    all.forEach((m) => { counts[m.unit] = (counts[m.unit] || 0) + 1; });
    const units = Object.keys(UNITS).filter((u) => counts[u]).concat(Object.keys(counts).filter((u) => !UNITS[u]));
    if (filter !== 'all' && !counts[filter]) filter = 'all';

    el.filters.textContent = '';
    el.filters.hidden = units.length < 2;
    [['all', '全部', all.length]].concat(units.map((u) => [u, unitName(u), counts[u]])).forEach(([value, label, n]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `chip${filter === value ? ' is-active' : ''}`;
      btn.textContent = `${label} ${n}`;
      btn.addEventListener('click', () => {
        filter = value;
        render();
      });
      el.filters.appendChild(btn);
    });
  }

  function renderItem(m) {
    const li = document.createElement('li');
    li.className = 'review-item';
    li.innerHTML = `
      <span class="review-hanji"></span>
      <div class="review-body">
        <div class="review-answer"></div>
        ${m.expectPitch && m.answerPitch ? pitchCompare(m.expectPitch, m.answerPitch) : '<div class="review-yours"></div>'}
        <div class="mistake-meta"></div>
      </div>
      <button class="mini-play" type="button" aria-label="播放">${ICON_PLAY}</button>
      <button class="mini-delete" type="button" aria-label="移出錯題本">${ICON_DELETE}</button>`;
    li.querySelector('.review-hanji').textContent = m.h;
    li.querySelector('.review-answer').textContent = m.s;
    const yours = li.querySelector('.review-yours');
    if (yours) yours.textContent = `你的答案：${m.answer}`;

    const meta = li.querySelector('.mistake-meta');
    const parts = [];
    if (filter === 'all') parts.push(unitName(m.unit));
    parts.push(`錯 ${m.count} 次`, formatDate(m.lastAt));
    meta.textContent = parts.join('・');
    if (m.fixedAt > m.lastAt) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = '已答對';
      meta.prepend(tag);
    }

    li.querySelector('.mini-play').addEventListener('click', () => {
      audio.src = audioUrl(m.a);
      audio.play().catch(() => {});
    });
    li.querySelector('.mini-delete').addEventListener('click', () => {
      mistakes.remove(m.key);
      render();
    });
    return li;
  }

  function render() {
    const all = mistakes.list();
    renderFilters(all);
    const shown = filter === 'all' ? all : all.filter((m) => m.unit === filter);

    el.list.textContent = '';
    shown.forEach((m) => el.list.appendChild(renderItem(m)));
    el.list.hidden = shown.length === 0;
    el.empty.hidden = shown.length > 0;
    el.footer.hidden = shown.length === 0;
    el.clearBtn.textContent = filter === 'all' ? '清空錯題本' : `清空「${unitName(filter)}」的錯題`;
  }

  el.clearBtn.addEventListener('click', () => {
    const scope = filter === 'all' ? '所有錯題' : `「${unitName(filter)}」的錯題`;
    if (!window.confirm(`確定要清空${scope}嗎？`)) return;
    mistakes.clear(filter === 'all' ? null : filter);
    render();
  });

  window.addEventListener('pageshow', render);
})();
