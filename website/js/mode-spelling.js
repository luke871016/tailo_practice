// 「拼寫」模式：聽單音節音檔，依序四選一選出聲母、韻母（、聲調）
//   kind 'part'：題目給出缺少聲母或韻母的音節（不顯示聲調），選出缺的那一部分
//   kind 'iv'：選聲母 → 選韻母
//   kind 'ivt'：選聲母 → 選韻母 → 選聲調
(function () {
  'use strict';

  const { shuffle, withTone, t } = window.LianTailo;

  const INITIALS = ['', 'p', 'ph', 'b', 'm', 't', 'th', 'n', 'l', 'k', 'kh', 'g', 'ng', 'h', 'ts', 'tsh', 's', 'j'];
  // 容易混淆的聲母：同發音部位（送氣、濁音、鼻音），以及喉音與無聲母
  const INITIAL_GROUPS = [
    ['p', 'ph', 'b', 'm'],
    ['t', 'th', 'l', 'n'],
    ['k', 'kh', 'g', 'ng'],
    ['h', '', 'g', 'k'],
    ['ts', 'tsh', 's', 'j'],
  ];
  const CODAS = ['nnh', 'nn', 'ng', 'm', 'n', 'p', 't', 'k', 'h'];
  const CHECKED = /[ptkh]$/;
  const LONG_TONES = [1, 2, 3, 5, 7];
  const CHECKED_TONES = [4, 8];
  const partName = (part) => t('part.' + part);
  const CHOICE_KEYS = ['1', '2', '3', '4'];

  function parseFinal(f) {
    for (const c of CODAS) {
      if (f.length > c.length && f.endsWith(c)) return { nucleus: f.slice(0, -c.length), coda: c };
    }
    return { nucleus: f, coda: '' };
  }

  function distance(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return dp[a.length][b.length];
  }

  // 依偏好順序從各層候選挑出三個錯誤選項，不夠再從全部裡補
  function pickThree(correct, tiers, all) {
    const out = [];
    const add = (x) => {
      if (x !== correct && !out.includes(x) && out.length < 3) {
        out.push(x);
        return true;
      }
      return false;
    };
    tiers.forEach(([list, max]) => {
      let n = 0;
      for (const x of shuffle(list)) {
        if (n >= max) break;
        if (add(x)) n++;
      }
    });
    shuffle(all).forEach(add);
    return out;
  }

  const label = (part, value) => {
    if (part === 'i') return value || '∅';
    if (part === 't') return t('tone.nth', { n: value });
    return value;
  };

  const CHOICE_SPEAKER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';

  // 單音節辭典：聲母、韻母、調號對到詞頻最高的一筆音檔
  const syllableAudio = new Map();
  (window.TONE_SYLLABLES || []).forEach((entry) => {
    if (!entry.p || entry.p.length !== 1 || !entry.a) return;
    const [i, r, t] = entry.p[0];
    const key = `${i}\0${r}\0${t}`;
    const prev = syllableAudio.get(key);
    if (!prev || entry.f > prev.f) syllableAudio.set(key, entry);
  });

  function audioFor(initial, final, tone) {
    const entry = syllableAudio.get(`${initial}\0${final}\0${tone}`);
    return entry ? entry.a : '';
  }

  function create(options) {
    const kind = (options && options.kind) || 'iv';
    let api = null;
    let finals = [];
    let syl = null;
    let steps = [];
    let step = 0;
    let answers = {};
    let choices = [];
    let lastChoice = -1;
    let display = null;
    let reviewing = false;
    const confirmable = kind === 'iv' || kind === 'ivt';
    const choiceAudio = new Audio();
    choiceAudio.preload = 'auto';
    let choiceAudioName = '';

    let suppressChoiceStop = false;

    function clearChoicePlaying() {
      api.el.choiceGrid.querySelectorAll('.choice-play.is-playing').forEach((btn) => {
        btn.classList.remove('is-playing');
      });
    }

    function stopChoiceAudio() {
      if (suppressChoiceStop) return;
      choiceAudio.pause();
      clearChoicePlaying();
    }

    function playChoice(fileName, btn) {
      api.pauseAudio();
      if (choiceAudioName === fileName && !choiceAudio.paused) {
        choiceAudio.pause();
        return;
      }
      suppressChoiceStop = true;
      choiceAudio.pause();
      clearChoicePlaying();
      suppressChoiceStop = false;
      if (choiceAudioName !== fileName) {
        choiceAudioName = fileName;
        choiceAudio.src = window.LianTailo.audioUrl(fileName);
      }
      try { choiceAudio.currentTime = 0; } catch (e) { /* 尚未載入 metadata */ }
      btn.classList.add('is-playing');
      const p = choiceAudio.play();
      if (p && p.catch) p.catch(() => btn.classList.remove('is-playing'));
    }

    const correctOf = (part) => (part === 'i' ? syl.i : part === 'r' ? syl.r : syl.t);
    const currentPart = () => steps[step];
    const usedInitial = () => (answers.i !== undefined ? answers.i : syl.i);
    const usedFinal = () => (answers.r !== undefined ? answers.r : syl.r);

    function optionsFor(part) {
      const correct = correctOf(part);
      let others;
      if (part === 'i') {
        const similar = [].concat(...INITIAL_GROUPS.filter((g) => g.includes(correct)));
        others = pickThree(correct, [[similar, 3]], INITIALS);
      } else if (part === 'r') {
        const p = parseFinal(correct);
        const sameNucleus = finals.filter((x) => parseFinal(x).nucleus === p.nucleus);
        const sameCoda = finals.filter((x) => {
          const q = parseFinal(x);
          return q.coda === p.coda && distance(q.nucleus, p.nucleus) === 1;
        });
        const near = finals.filter((x) => distance(x, correct) === 1);
        others = pickThree(correct, [[sameNucleus, 2], [sameCoda, 1], [near, 3]], finals);
      } else {
        // -p -t -k -h 結尾必為入聲，只有第 4、8 調；其他韻母沒有這兩調
        const valid = CHECKED.test(usedFinal()) ? CHECKED_TONES : LONG_TONES;
        if (!valid.includes(correct)) return shuffle(valid).slice(0, 4);
        others = pickThree(correct, [[valid, 3]], valid);
      }
      return shuffle([correct].concat(others));
    }

    function renderDisplay(finished) {
      const parts = kind === 'ivt' ? ['i', 'r', 't'] : ['i', 'r'];
      display.innerHTML = parts.map((part) => {
        const given = kind === 'part' && part !== steps[0];
        let text;
        let cls;
        let fix = '';
        if (given) {
          text = label(part, correctOf(part));
          cls = 'is-given';
        } else if (answers[part] !== undefined) {
          const right = answers[part] === correctOf(part);
          text = label(part, answers[part]);
          cls = finished ? (right ? 'is-correct' : 'is-wrong') : 'is-filled';
          if (finished && !right) fix = `<span class="spell-fix">${label(part, correctOf(part))}</span>`;
        } else {
          text = '?';
          cls = currentPart() === part ? 'is-active' : 'is-pending';
        }
        const editable = !finished && confirmable && (part === 'i' || part === 'r') && answers[part] !== undefined;
        return `
          <button type="button" class="spell-slot is-${part} ${cls}${editable ? ' is-editable' : ''}" data-part="${part}"${editable ? '' : ' disabled'}>
            <span class="spell-text">${text}</span>
            <span class="spell-meta">${fix}<span class="spell-label">${partName(part)}</span></span>
          </button>`;
      }).join('');
      display.querySelectorAll('.spell-slot.is-editable').forEach((btn) => {
        btn.addEventListener('click', () => editPart(btn.dataset.part));
      });
    }

    // 聲母、韻母已填時可點回去重選；從該步起的答案清掉，後面再依序選
    function editPart(part) {
      if (!confirmable || api.isAnswered()) return;
      const idx = steps.indexOf(part);
      if (idx < 0 || answers[part] === undefined) return;
      for (let j = idx; j < steps.length; j++) delete answers[steps[j]];
      reviewing = false;
      step = idx;
      lastChoice = -1;
      renderDisplay(false);
      renderChoices();
      refresh();
    }

    function renderChoices() {
      const part = currentPart();
      choices = optionsFor(part);
      const grid = api.el.choiceGrid;
      grid.textContent = '';
      grid.classList.toggle('is-two', choices.length <= 2);
      choices.forEach((value, i) => {
        const btn = document.createElement(part === 't' ? 'div' : 'button');
        if (part === 't') {
          btn.setAttribute('role', 'button');
          btn.tabIndex = 0;
        } else {
          btn.type = 'button';
        }
        btn.className = 'choice is-text';
        if (part === 't') {
          btn.innerHTML = '<span class="choice-main"></span><span class="choice-sub"></span>';
          btn.querySelector('.choice-main').textContent = withTone(usedInitial(), usedFinal(), value);
          btn.querySelector('.choice-sub').textContent = label('t', value);
        } else {
          btn.innerHTML = '<span class="choice-main"></span>';
          btn.querySelector('.choice-main').textContent = part === 'i' ? (value || t('spell.noInitial')) : value;
        }
        if (reviewing && value === answers[part]) btn.classList.add('is-picked');
        btn.addEventListener('click', () => choose(i));
        grid.appendChild(btn);
      });
    }

    function enterReview(i) {
      reviewing = true;
      lastChoice = i;
      renderDisplay(false);
      [...api.el.choiceGrid.children].forEach((btn, n) => {
        btn.classList.toggle('is-picked', n === i);
      });
      refresh();
    }

    function choose(i) {
      if (api.isAnswered() || i < 0 || i >= choices.length) return;
      if (reviewing) {
        answers[steps[steps.length - 1]] = choices[i];
        enterReview(i);
        return;
      }
      answers[currentPart()] = choices[i];
      step++;
      if (step < steps.length) {
        renderDisplay(false);
        renderChoices();
        refresh();
      } else if (confirmable) {
        enterReview(i);
      } else {
        lastChoice = i;
        api.submit('choice');
      }
    }

    function render(item) {
      const [i, r, t] = item.p[0];
      syl = { i, r, t };
      if (kind === 'part') steps = [Math.random() < 0.5 ? 'i' : 'r'];
      else steps = kind === 'iv' ? ['i', 'r'] : ['i', 'r', 't'];
      step = 0;
      answers = {};
      lastChoice = -1;
      reviewing = false;

      const stage = api.el.stage;
      stage.classList.add('is-spelling');
      if (!display) {
        display = document.createElement('div');
        display.className = 'spell-display';
        stage.insertBefore(display, api.el.choiceGrid);
      }
      renderDisplay(false);
      renderChoices();
    }

    function refresh() {
      if (api.isAnswered()) return;
      if (reviewing) {
        api.setStatus(t('spell.status.review'));
        api.setSubmitEnabled(true);
        return;
      }
      api.setSubmitEnabled(false);
      const name = partName(currentPart());
      if (kind === 'part') api.setStatus(t('spell.status.part', { name }));
      else api.setStatus(t('spell.status.step', { n: step + 1, name }));
    }

    function submit() {
      if (!reviewing && step < steps.length) return null;
      if (confirmable && !reviewing) return null;
      const lastPart = steps[steps.length - 1];
      const compareTones = kind === 'ivt' && lastPart === 't';
      [...api.el.choiceGrid.children].forEach((btn, i) => {
        const file = compareTones ? audioFor(usedInitial(), usedFinal(), choices[i]) : '';
        if (file) {
          btn.classList.add('is-settled', 'has-audio');
          btn.removeAttribute('tabindex');
          const playBtn = document.createElement('button');
          playBtn.type = 'button';
          playBtn.className = 'choice-play';
          playBtn.setAttribute('aria-label', t('action.play.this'));
          playBtn.innerHTML = CHOICE_SPEAKER;
          playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playChoice(file, playBtn);
          });
          btn.appendChild(playBtn);
        } else if (btn.tagName === 'BUTTON') {
          btn.disabled = true;
        } else {
          btn.classList.add('is-settled');
          btn.removeAttribute('tabindex');
        }
        btn.classList.toggle('is-correct', choices[i] === correctOf(lastPart));
        btn.classList.toggle('is-wrong', i === lastChoice && choices[i] !== correctOf(lastPart));
      });
      renderDisplay(true);

      const wrong = steps.filter((part) => answers[part] !== correctOf(part));
      const ok = wrong.length === 0;
      const initialShown = syl.i || t('spell.none');
      let meta = kind === 'ivt'
        ? t('spell.meta.tone', { i: initialShown, r: syl.r, n: syl.t })
        : t('spell.meta', { i: initialShown, r: syl.r });

      let answer;
      if (kind === 'part') answer = `${partName(steps[0])} ${label(steps[0], answers[steps[0]])}`;
      else if (kind === 'iv') answer = usedInitial() + usedFinal();
      else answer = withTone(usedInitial(), usedFinal(), answers.t);
      if (!ok && kind !== 'part') meta += '　' + t('spell.yours', { answer });

      return {
        ok,
        verdict: ok ? '' : t('spell.wrong', { parts: wrong.map((p) => partName(p)).join('、') }),
        meta,
        answer,
      };
    }

    return {
      top: 'listen',
      stage: 'choices',
      actions: confirmable ? [{ action: 'submit', label: t('action.submit'), style: 'primary' }] : [],
      mount(shellApi) {
        api = shellApi;
        finals = options.finals || [];
        ['pause', 'ended', 'error'].forEach((ev) => {
          choiceAudio.addEventListener(ev, stopChoiceAudio);
        });
        api.el.playBtn.addEventListener('click', stopChoiceAudio);
        document.addEventListener('keydown', (e) => {
          if (e.key === ' ') stopChoiceAudio();
        });
      },
      render,
      refresh,
      clear() {},
      onStroke() {},
      onKey(key) {
        const i = CHOICE_KEYS.indexOf(key);
        if (i < 0) return false;
        choose(i);
        return true;
      },
      submit,
    };
  }

  window.SpellingMode = { create };
})();
