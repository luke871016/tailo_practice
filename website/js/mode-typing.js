// 「練打字」：聽音檔，打出台羅。
// 調符（hóo）和數字調（hoo2）都算對；音節之間的連字符、空白可以省略。
(function () {
  'use strict';

  const TONE_MARK = {
    '\u0301': 2,
    '\u0300': 3,
    '\u0302': 5,
    '\u0304': 7,
    '\u030d': 8,
    '\u030c': 6,
    '\u030b': 9,
  };

  function normalizeInput(raw) {
    return String(raw || '')
      .normalize('NFD')
      .toLowerCase()
      .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
      .replace(/[\s\u00b7\u2027\u30fb_\-\u2010-\u2015\u2212\ufe63\uff0d]+/g, '');
  }

  // parts: [[聲母, 韻母, 調號], ...]
  function tailoInputMatches(raw, parts) {
    const s = normalizeInput(raw);
    let i = 0;
    for (let n = 0; n < parts.length; n++) {
      const base = String(parts[n][0] + parts[n][1]).toLowerCase();
      const tone = parts[n][2];
      let seen = 0;
      for (let k = 0; k < base.length; k++) {
        if (s[i] !== base[k]) return false;
        i++;
        const mark = TONE_MARK[s[i]];
        if (mark) {
          if (seen && seen !== mark) return false;
          seen = mark;
          i++;
        }
      }
      if (s[i] >= '1' && s[i] <= '9') {
        const num = Number(s[i]);
        if (seen && seen !== num) return false;
        seen = num;
        i++;
      }
      if (seen) {
        if (seen !== tone) return false;
      } else if (tone !== 1 && tone !== 4) {
        return false;
      }
    }
    return i === s.length;
  }

  function create() {
    let api = null;
    let input = null;
    let parts = null;

    const hint = () => window.LianTailo.t('type.hint');

    function sync() {
      if (!input || api.isAnswered()) return;
      api.setSubmitEnabled(input.value.trim().length > 0);
      api.setStatus(hint());
    }

    return {
      top: 'listen',
      stage: 'type',
      actions: [{ action: 'submit', label: window.LianTailo.t('action.submit'), style: 'primary' }],
      mount(shellApi) {
        api = shellApi;
        input = shellApi.el.typeInput;
        input.placeholder = window.LianTailo.t('type.placeholder');
        input.addEventListener('input', sync);
      },
      render(item) {
        parts = item.p;
        input.disabled = false;
        input.value = '';
        window.setTimeout(() => {
          if (!api.isAnswered()) input.focus();
        }, 0);
      },
      refresh: sync,
      clear() {
        if (!input || api.isAnswered()) return;
        input.value = '';
      },
      onStroke() {},
      submit() {
        const typed = input.value.trim();
        if (!typed || !parts) return null;
        const ok = tailoInputMatches(typed, parts);
        input.disabled = true;
        return {
          ok,
          verdict: ok ? '' : window.LianTailo.t('type.wrong'),
          meta: ok ? '' : window.LianTailo.t('spell.yours', { answer: typed }),
          answer: typed,
        };
      },
    };
  }

  window.TypingMode = { create, tailoInputMatches };
})();
