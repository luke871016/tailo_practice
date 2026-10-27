(function () {
  'use strict';

  const AUDIO_BASE = 'https://static.kiantiong.com/sutiau/';
  const MISTAKES_KEY = 'lian-tailo:mistakes';

  // 錯題本用來顯示單元名稱；新增單元時在這裡登記
  const UNITS = {
    'tone-1': { name: '畫出單音節聲調', short: '單音節聲調', href: 'tone-draw/' },
    'tone-2': { name: '畫出雙音節聲調', short: '雙音節聲調', href: 'tone-draw-2/' },
    'pitch-1': { name: '選單音節音值', short: '單音節音值', href: 'pitch-choice/' },
    'pitch-2': { name: '選雙音節音值', short: '雙音節音值', href: 'pitch-choice-2/' },
    'spell-1': { name: '選聲母／韻母', short: '選聲母／韻母', href: 'spell-part/' },
    'spell-2': { name: '聲韻拼寫', short: '聲韻拼寫', href: 'spell-iv/' },
    'spell-3': { name: '聲韻調拼寫', short: '聲韻調拼寫', href: 'spell-ivt/' },
  };

  // 分組平均出題時，每組（聲調或變調規則）取詞頻最高的幾個當題庫；題庫檢查頁的「出題範圍」也依此計算
  const POOL_PER_GROUP = { tone: 50, sandhiRule: 40 };

  function audioUrl(fileName) {
    return AUDIO_BASE + encodeURIComponent(fileName) + '.mp3';
  }

  function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- 練習設定（各單元通用） ----------

  const SETTINGS_KEY = 'lian-tailo:settings';
  const SETTINGS_DEFAULT = { count: 10, showHanji: false };
  const COUNT_OPTIONS = [5, 10, 20, 30];

  const settings = {
    COUNT_OPTIONS,
    get() {
      try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
        const s = Object.assign({}, SETTINGS_DEFAULT, saved);
        if (!COUNT_OPTIONS.includes(s.count)) s.count = SETTINGS_DEFAULT.count;
        s.showHanji = !!s.showHanji;
        return s;
      } catch (e) {
        return Object.assign({}, SETTINGS_DEFAULT);
      }
    },
    set(patch) {
      const next = Object.assign(settings.get(), patch);
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch (e) { /* 私密瀏覽模式可能無法寫入 */ }
      return next;
    },
  };

  // ---------- 錯題本 ----------
  // 格式：{ version: 1, items: { "<單元>|<音檔檔名>": { unit, a, s, h, answer, answerPitch, expectPitch, count, firstAt, lastAt, fixedAt } } }
  // answer 為文字版的作答；音值題另存 answerPitch、expectPitch（各音節的音值陣列）以畫出音值圖

  function readMistakes() {
    try {
      const db = JSON.parse(localStorage.getItem(MISTAKES_KEY));
      if (db && db.items && typeof db.items === 'object') return db;
    } catch (e) { /* 資料損毀就重來 */ }
    return { version: 1, items: {} };
  }

  function writeMistakes(db) {
    try {
      localStorage.setItem(MISTAKES_KEY, JSON.stringify(db));
    } catch (e) { /* 私密瀏覽模式可能無法寫入 */ }
  }

  const mistakes = {
    record(unit, item, detail) {
      const db = readMistakes();
      const key = `${unit}|${item.a}`;
      const prev = db.items[key];
      const now = Date.now();
      db.items[key] = {
        unit,
        a: item.a,
        s: item.s,
        h: item.h,
        answer: detail.answer,
        answerPitch: detail.answerPitch || null,
        expectPitch: detail.expectPitch || null,
        count: (prev ? prev.count : 0) + 1,
        firstAt: prev ? prev.firstAt : now,
        lastAt: now,
        fixedAt: 0,
      };
      writeMistakes(db);
    },

    // 錯過的題目之後答對，記下時間，錯題本會標示「已答對」
    markCorrect(unit, item) {
      const db = readMistakes();
      const entry = db.items[`${unit}|${item.a}`];
      if (!entry) return;
      entry.fixedAt = Date.now();
      writeMistakes(db);
    },

    list() {
      const db = readMistakes();
      return Object.keys(db.items)
        .map((key) => Object.assign({ key }, db.items[key]))
        .sort((x, y) => y.lastAt - x.lastAt);
    },

    remove(key) {
      const db = readMistakes();
      delete db.items[key];
      writeMistakes(db);
    },

    clear(unit) {
      const db = readMistakes();
      Object.keys(db.items).forEach((key) => {
        if (!unit || db.items[key].unit === unit) delete db.items[key];
      });
      writeMistakes(db);
    },
  };

  window.LianTailo = Object.assign(window.LianTailo || {}, { UNITS, POOL_PER_GROUP, audioUrl, shuffle, mistakes, settings });
})();
