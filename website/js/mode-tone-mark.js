// 「畫出調符」模式：聽音檔，在字母上方畫出台羅調符（單音節、多音節共用）
(function () {
  'use strict';

  const { svgEl } = window.QuizShell;

  // 以下皆為 SVG 座標單位，字母字級為 100
  const LETTER_GAP = 8;
  const PART_GAP = 30;
  const SYLLABLE_GAP = 22;
  const PAD_X = 40;
  const SINGLE_BASELINE = 183;
  const SINGLE_HEIGHT = 268;
  const ROW_BASELINE = 180;
  const ROW_HEIGHT = 240;
  const MIN_STROKE = 14;
  const MAX_PAIR_DISTANCE = 70;

  const COMBINING = { 2: '\u0301', 3: '\u0300', 5: '\u0302', 6: '\u030C', 7: '\u0304', 8: '\u030D', 9: '\u030B' };

  function composeSyllable(base, mark) {
    if (!mark) return base;
    return (base.slice(0, mark.index + 1) + COMBINING[mark.tone] + base.slice(mark.index + 1)).normalize('NFC');
  }

  function measureXHeight(textNode) {
    try {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `100px ${getComputedStyle(textNode).fontFamily}`;
      const h = ctx.measureText('x').actualBoundingBoxAscent;
      if (h > 30 && h < 80) return h;
    } catch (e) { /* 使用預設值 */ }
    return 53;
  }

  function markPaths(tone, cx, cy) {
    switch (tone) {
      case 2: return [`M ${cx - 8} ${cy + 15} L ${cx + 8} ${cy - 15}`];
      case 3: return [`M ${cx - 8} ${cy - 15} L ${cx + 8} ${cy + 15}`];
      case 5: return [`M ${cx - 16} ${cy + 9} L ${cx} ${cy - 11} L ${cx + 16} ${cy + 9}`];
      case 6: return [`M ${cx - 16} ${cy - 9} L ${cx} ${cy + 11} L ${cx + 16} ${cy - 9}`];
      case 7: return [`M ${cx - 20} ${cy} L ${cx + 20} ${cy}`];
      case 8: return [`M ${cx} ${cy - 15} L ${cx} ${cy + 15}`];
      case 9: return [
        `M ${cx - 16} ${cy + 15} L ${cx - 2} ${cy - 15}`,
        `M ${cx + 2} ${cy + 15} L ${cx + 16} ${cy - 15}`,
      ];
      default: return [];
    }
  }

  function pathLength(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return len;
  }

  function bounds(pts) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }

  // 回傳調號（2、3、5、6、7、8），認不出來回傳 null
  function classifyStroke(pts) {
    const s = pts[0];
    const e = pts[pts.length - 1];
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    const chord = Math.hypot(dx, dy);
    if (chord < MIN_STROKE * 0.6) return null;

    let maxDev = 0;
    pts.forEach((p) => {
      const d = Math.abs((p.x - s.x) * dy - (p.y - s.y) * dx) / chord;
      if (d > maxDev) maxDev = d;
    });

    if (maxDev / chord > 0.22) {
      const b = bounds(pts);
      const h = b.maxY - b.minY;
      const total = pathLength(pts);
      let topIdx = 0, bottomIdx = 0;
      pts.forEach((p, i) => {
        if (p.y < pts[topIdx].y) topIdx = i;
        if (p.y > pts[bottomIdx].y) bottomIdx = i;
      });
      const frac = (idx) => pathLength(pts.slice(0, idx + 1)) / total;
      const interior = (idx) => frac(idx) > 0.15 && frac(idx) < 0.85;
      if (interior(topIdx) && s.y - b.minY > 0.4 * h && e.y - b.minY > 0.4 * h) return 5;
      if (interior(bottomIdx) && b.maxY - s.y > 0.4 * h && b.maxY - e.y > 0.4 * h) return 6;
      return null;
    }

    let angle = Math.atan2(-dy, dx) * 180 / Math.PI;
    if (angle < 0) angle += 180;
    if (angle >= 180) angle -= 180;
    if (angle < 22 || angle > 158) return 7;
    if (angle >= 72 && angle <= 108) return 8;
    return angle < 90 ? 2 : 3;
  }

  function recognize(strokeList) {
    const tones = strokeList.map(classifyStroke);
    if (tones.some((t) => t === null)) return null;
    const all = bounds([].concat(...strokeList));

    if (strokeList.length === 1) return { tone: tones[0], cx: all.cx };

    if (strokeList.length === 2) {
      const parts = strokeList.map((pts, i) => ({ tone: tones[i], b: bounds(pts) }))
        .sort((a, b) => a.b.cx - b.b.cx);
      const dist = Math.hypot(parts[1].b.cx - parts[0].b.cx, parts[1].b.cy - parts[0].b.cy);
      if (dist > MAX_PAIR_DISTANCE) return null;
      const tone = { 22: 9, 23: 5, 32: 6 }[`${parts[0].tone}${parts[1].tone}`];
      return tone ? { tone, cx: all.cx } : null;
    }
    return null;
  }

  function judgeSyllable(syl, user) {
    const correct = syl.m >= 0 ? { tone: syl.t, index: syl.m } : null;
    const ok = correct
      ? !!user && user.tone === correct.tone && user.index === correct.index
      : !user;
    return { correct, user, ok };
  }

  function reasonText(r, subject) {
    if (!r.correct) return `${subject}不用標調符`;
    if (!r.user) return `${subject}需要標調符`;
    const prefix = subject === '這個音節' ? '' : `${subject}：`;
    if (r.user.tone === r.correct.tone) return `${prefix}調符對了，位置不對`;
    if (r.user.index === r.correct.index) return `${prefix}位置對了，調符不對`;
    return `${prefix}調符和位置都不對`;
  }

  function create() {
    const drawHint = '在韻母上方畫出調符。不用調符就留白，按「確定」送出。';
    let api = null;
    let syls = [];
    let markLayer = null;

    function layoutSize(hyphenWidth) {
      const content = syls.reduce((sum, s) => sum + s.width, 0) + (syls.length - 1) * (SYLLABLE_GAP * 2 + hyphenWidth);
      return { content, w: Math.max(460, content + PAD_X * 2), h: syls.length > 1 ? ROW_HEIGHT : SINGLE_HEIGHT };
    }

    function render(item) {
      const svg = api.el.svg;
      syls = item.p.map(([i, r, t, m]) => ({
        i, r, t, m, base: i + r, letters: [], strokes: [], guess: null, unknown: false,
      }));

      const probe = svgEl('text', { class: 'stage-letter' });
      svg.appendChild(probe);
      const widths = {};
      const widthOf = (ch) => {
        if (!(ch in widths)) {
          probe.textContent = ch;
          widths[ch] = probe.getComputedTextLength() || 55;
        }
        return widths[ch];
      };
      const xHeight = measureXHeight(probe);
      const hyphenWidth = widthOf('-');
      // 單音節會標示聲母、韻母，兩者之間多留空隙
      const partGap = syls.length === 1 ? PART_GAP : LETTER_GAP;
      syls.forEach((s) => {
        let x = 0;
        for (let k = 0; k < s.base.length; k++) {
          if (k === s.i.length && s.i.length > 0) x += partGap - LETTER_GAP;
          const w = widthOf(s.base[k]);
          s.letters.push({ ch: s.base[k], x, w, initial: k < s.i.length });
          x += w + LETTER_GAP;
        }
        s.width = x - LETTER_GAP;
      });
      probe.remove();

      // 多音節一律橫排並保留連字號；字太長時由 viewBox 縮小塞進畫布
      const size = layoutSize(hyphenWidth);
      svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);

      const place = (s, offsetX, baseline) => {
        s.baseline = baseline;
        s.markY = baseline - xHeight - 26;
        s.letters.forEach((l) => {
          l.x += offsetX;
          l.cx = l.x + l.w / 2;
          l.node = svgEl('text', { class: `stage-letter ${l.initial ? 'is-initial' : 'is-final'}`, x: l.x, y: baseline });
          l.node.textContent = l.ch;
          svg.appendChild(l.node);
        });
      };

      const baseline = syls.length > 1 ? ROW_BASELINE : SINGLE_BASELINE;
      let cursor = (size.w - size.content) / 2;
      syls.forEach((s, k) => {
        place(s, cursor, baseline);
        cursor += s.width;
        if (k < syls.length - 1) {
          const hyphen = svgEl('text', { class: 'stage-letter stage-hyphen', x: cursor + SYLLABLE_GAP, y: baseline });
          hyphen.textContent = '-';
          svg.appendChild(hyphen);
          cursor += SYLLABLE_GAP * 2 + hyphenWidth;
        }
      });

      // 單音節才標聲母、韻母
      if (syls.length === 1) {
        const s = syls[0];
        const parts = [];
        if (s.i) parts.push({ label: '聲母', from: 0, to: s.i.length - 1 });
        parts.push({ label: '韻母', from: s.i.length, to: s.base.length - 1 });
        const by = s.baseline + 40;
        parts.forEach((p) => {
          const x1 = s.letters[p.from].x + 2;
          const x2 = s.letters[p.to].x + s.letters[p.to].w - 2;
          svg.appendChild(svgEl('path', { class: 'stage-bracket', d: `M ${x1} ${by - 8} V ${by} H ${x2} V ${by - 8}` }));
          const label = svgEl('text', { class: 'stage-label', x: (x1 + x2) / 2, y: by + 32, 'text-anchor': 'middle' });
          label.textContent = p.label;
          svg.appendChild(label);
        });
      }

      markLayer = svgEl('g', {});
      svg.appendChild(markLayer);
    }

    function drawMark(sylIndex, mark, cls) {
      const s = syls[sylIndex];
      const letter = s.letters[mark.index];
      if (!letter) return;
      if (letter.ch === 'i') letter.node.textContent = 'ı';
      markPaths(mark.tone, letter.cx, s.markY).forEach((d) => {
        markLayer.appendChild(svgEl('path', { class: `mark ${cls}`, d }));
      });
    }

    function clearMarks() {
      markLayer.textContent = '';
      syls.forEach((s) => s.letters.forEach((l) => { l.node.textContent = l.ch; }));
    }

    function nearestLetter(cx, cy, onlySyl) {
      let best = null;
      let bestD = Infinity;
      syls.forEach((s, k) => {
        if (onlySyl != null && k !== onlySyl) return;
        s.letters.forEach((l, index) => {
          const d = Math.abs(l.cx - cx) + Math.abs(s.markY - cy) * 0.5;
          if (d < bestD) {
            bestD = d;
            best = { syl: k, index };
          }
        });
      });
      return best;
    }

    function evaluateSyllable(k) {
      const s = syls[k];
      if (!s.strokes.length) {
        s.guess = null;
        s.unknown = false;
        return;
      }
      let result = recognize(s.strokes.map((st) => st.pts));
      if (!result && s.strokes.length === 2) {
        // 第二筆單獨看得懂，就當作重畫
        const alone = recognize([s.strokes[1].pts]);
        if (alone) {
          s.strokes[0].node.remove();
          s.strokes.shift();
          result = alone;
        }
      }
      if (result) {
        s.guess = { tone: result.tone, index: nearestLetter(result.cx, s.markY, k).index };
        s.unknown = false;
        // 筆畫資料要留著，下一筆才有辦法跟它併成雙筆調符；畫面上只留標準調符
        s.strokes.forEach((st) => st.node.remove());
      } else {
        s.guess = null;
        s.unknown = true;
        s.strokes.forEach((st) => {
          st.node.classList.add('is-unknown');
          if (!st.node.parentNode) s.inkParent.appendChild(st.node);
        });
      }
    }

    function onStroke(stroke) {
      const b = bounds(stroke.pts);
      const k = nearestLetter(b.cx, b.cy).syl;
      const s = syls[k];
      if (s.strokes.length >= 2 || s.unknown) {
        s.strokes.forEach((st) => st.node.remove());
        s.strokes = [];
      }
      s.inkParent = stroke.node.parentNode;
      s.strokes.push(stroke);
      evaluateSyllable(k);
    }

    function refresh() {
      if (api.isAnswered()) return;
      clearMarks();
      syls.forEach((s, k) => { if (s.guess) drawMark(k, s.guess, 'is-guess'); });
      const anyUnknown = syls.some((s) => s.unknown);
      const anyStroke = syls.some((s) => s.strokes.length);
      const single = syls.length === 1;

      api.setSubmitEnabled(!anyUnknown);
      if (anyUnknown) api.setStatus('認不出這個符號，請再畫一次', true);
      else if (anyStroke) api.setStatus(single ? '按「確定」送出，或直接重畫' : '畫好了就按「確定」，可以再修改');
      else api.setStatus(drawHint);
    }

    function clear() {
      syls.forEach((s) => {
        s.strokes = [];
        s.guess = null;
        s.unknown = false;
      });
    }

    function submit() {
      if (syls.some((s) => s.unknown)) return null;

      const single = syls.length === 1;
      const results = syls.map((s) => judgeSyllable(s, s.guess));
      const ok = results.every((r) => r.ok);
      const answer = single && !results[0].user
        ? '無調符'
        : syls.map((s, k) => composeSyllable(s.base, results[k].user)).join('-');

      api.clearInk();
      clearMarks();
      results.forEach((r, k) => {
        if (!r.ok && r.user && (!r.correct || r.user.index !== r.correct.index)) drawMark(k, r.user, 'is-wrong');
        if (r.correct) drawMark(k, r.correct, 'is-correct');
      });

      let verdict = '';
      if (!ok) {
        const wrongIdx = results.map((r, k) => (r.ok ? -1 : k)).filter((k) => k >= 0);
        if (single) verdict = reasonText(results[0], '這個音節');
        else if (wrongIdx.length === syls.length) verdict = '兩個音節都不對';
        else verdict = reasonText(results[wrongIdx[0]], `第 ${wrongIdx[0] + 1} 個音節`);
      }

      let meta = `第 ${syls.map((s) => s.t).join('、')} 調`;
      if (!ok) meta += `　你的答案：${answer}`;
      return { ok, verdict, meta, answer };
    }

    const actions = [
      { action: 'clear', label: '重畫', style: 'ghost' },
      { action: 'submit', label: '確定', style: 'primary' },
    ];

    return {
      top: 'listen',
      actions,
      mount(shellApi) { api = shellApi; },
      render,
      refresh,
      clear,
      onStroke,
      submit,
    };
  }

  window.ToneMarkMode = { create };
})();
