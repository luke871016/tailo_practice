// 「拼寫」模式：聽單音節音檔，依序四選一選出聲母、韻母（、聲調）
//   kind 'part'：題目給出缺少聲母或韻母的音節（不顯示聲調），選出缺的那一部分
//   kind 'iv'：選聲母 → 選韻母
//   kind 'ivt'：選聲母 → 選韻母 → 選聲調
(function () {
  'use strict';

  const { shuffle, withTone } = window.LianTailo;

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
  const PART_NAME = { i: '聲母', r: '韻母', t: '聲調' };
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
    if (part === 't') return `第 ${value} 調`;
    return value;
  };

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
            <span class="spell-meta">${fix}<span class="spell-label">${PART_NAME[part]}</span></span>
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
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'choice is-text';
        if (part === 't') {
          btn.innerHTML = '<span class="choice-main"></span><span class="choice-sub"></span>';
          btn.querySelector('.choice-main').textContent = withTone(usedInitial(), usedFinal(), value);
          btn.querySelector('.choice-sub').textContent = label('t', value);
        } else {
          btn.innerHTML = '<span class="choice-main"></span>';
          btn.querySelector('.choice-main').textContent = part === 'i' ? (value || '無聲母') : value;
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
        api.setStatus('確認拼法後按「確定」。點聲母或韻母可以回去改');
        api.setSubmitEnabled(true);
        return;
      }
      api.setSubmitEnabled(false);
      const name = PART_NAME[currentPart()];
      if (kind === 'part') api.setStatus(`聽音檔，選出缺少的${name}`);
      else api.setStatus(`第 ${step + 1} 步：選出${name}`);
    }

    function submit() {
      if (!reviewing && step < steps.length) return null;
      if (confirmable && !reviewing) return null;
      const lastPart = steps[steps.length - 1];
      [...api.el.choiceGrid.children].forEach((btn, i) => {
        btn.disabled = true;
        btn.classList.toggle('is-correct', choices[i] === correctOf(lastPart));
        btn.classList.toggle('is-wrong', i === lastChoice && choices[i] !== correctOf(lastPart));
      });
      renderDisplay(true);

      const wrong = steps.filter((part) => answers[part] !== correctOf(part));
      const ok = wrong.length === 0;
      let meta = `聲母 ${syl.i || '（無）'}・韻母 ${syl.r}`;
      if (kind === 'ivt') meta += `・第 ${syl.t} 調`;

      let answer;
      if (kind === 'part') answer = `${PART_NAME[steps[0]]} ${label(steps[0], answers[steps[0]])}`;
      else if (kind === 'iv') answer = usedInitial() + usedFinal();
      else answer = withTone(usedInitial(), usedFinal(), answers.t);
      if (!ok && kind !== 'part') meta += `　你的拼法：${answer}`;

      return {
        ok,
        verdict: ok ? '' : `${wrong.map((p) => PART_NAME[p]).join('、')}不對`,
        meta,
        answer,
      };
    }

    return {
      top: 'listen',
      stage: 'choices',
      actions: confirmable ? [{ action: 'submit', label: '確定', style: 'primary' }] : [],
      mount(shellApi) {
        api = shellApi;
        finals = options.finals || [];
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
