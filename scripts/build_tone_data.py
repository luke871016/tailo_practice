"""產生「畫出聲調」系列練習用的題庫。

來源：
- data/hanji_tailo_word_freq.csv：台語歌詞詞頻
- data/kautian.ods：教育部辭典詞目（工作表「詞目」）

輸出：
- website/data/tone-syllables.js：單音節
- website/data/tone-words.js：雙音節（以連字符相連的詞目，排除輕聲與「仔」尾）
- website/data/sandhi-words.js：雙音節加上前字變調，並套用 data/sandhi_overrides.csv 的人工檢查結果
  （選雙音節音值、畫雙音節調符都用這份；排除項帶 x，兩種練習都不出題）
"""

import csv
import json
import re
import unicodedata as ud
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
FREQ_CSV = ROOT / "data" / "hanji_tailo_word_freq.csv"
KAUTIAN_ODS = ROOT / "data" / "kautian.ods"
OUT_DIR = ROOT / "website" / "data"
SANDHI_OVERRIDES = ROOT / "data" / "sandhi_overrides.csv"  # 題庫檢查頁匯出的人工檢查結果
DOUBLE_LIMIT = 1500  # 雙音節只取詞頻最高的前段，避免題庫檔過大
SANDHI_PER_RULE = 80  # 變調題庫每條規則保留的詞數（出題取其中前段，其餘留作排除後的備用）

INITIALS = ["tsh", "ts", "ph", "th", "kh", "ng", "p", "m", "b", "t", "n", "l", "k", "g", "h", "s", "j"]
TONE_MARKS = {
    "\u0301": 2,  # ́
    "\u0300": 3,  # ̀
    "\u0302": 5,  # ̂
    "\u030c": 6,  # ̌
    "\u0304": 7,  # ̄
    "\u030d": 8,  # ̍
    "\u030b": 9,  # ̋
}
SYLLABLE_RE = re.compile(r"^[a-z]+$")
SINGLE_RE = re.compile(r"^[^\s\-]+$")
DOUBLE_RE = re.compile(r"^[^\s\-]+-[^\s\-]+$")


def nfc(s: str) -> str:
    return ud.normalize("NFC", s.strip())


def clean_kautian_romaji(s: str) -> str:
    """去掉【白】【文】等標記，斜線取左邊（主音讀、有音檔的那個）。"""
    s = re.sub(r"【.*?】", "", s)
    return nfc(s.split("/")[0])


def split_initial(base: str) -> tuple[str, str]:
    for ini in INITIALS:
        if base.startswith(ini):
            rest = base[len(ini):]
            # m、ng 成音節（m̄、n̂g、mh、ngh）時無聲母
            if rest in ("", "h"):
                return "", base
            return ini, rest
    return "", base


def parse_syllable(syl: str):
    """回傳 [聲母, 韻母, 調號, 調符所在字母位置]，無法解析時回傳 None。"""
    nfd = ud.normalize("NFD", syl.lower())
    base = ""
    tone = None
    mark_index = -1
    for ch in nfd:
        if ud.combining(ch):
            if ch not in TONE_MARKS or tone is not None or not base:
                return None
            tone = TONE_MARKS[ch]
            mark_index = len(base) - 1
        else:
            base += ch
    if not SYLLABLE_RE.match(base):
        return None
    if tone is None:
        tone = 4 if base[-1] in "ptkh" else 1
    initial, final = split_initial(base)
    if not any(v in final for v in "aeioum") and final not in ("ng", "ngh"):
        return None
    return [initial, final, tone, mark_index]


def load_freq() -> pd.DataFrame:
    freq = pd.read_csv(FREQ_CSV)
    freq["tailo"] = freq["tailo"].fillna("").astype(str).map(nfc)
    freq["hanji"] = freq["hanji"].fillna("").astype(str).map(str.strip)
    freq["key"] = freq["tailo"].str.lower()
    return freq[freq["key"] != ""]


def load_entries() -> pd.DataFrame:
    entries = pd.read_excel(KAUTIAN_ODS, engine="odf", sheet_name="詞目")
    entries = entries[entries["羅馬字音檔檔名"].notna()].copy()
    entries["hj"] = entries["漢字"].fillna("").astype(str).str.replace(r"【.*?】", "", regex=True).str.strip()
    entries["rom"] = entries["羅馬字"].fillna("").astype(str).map(clean_kautian_romaji)
    entries = entries[~entries["rom"].str.startswith("--")]
    entries["key"] = entries["rom"].str.lower()
    return entries.drop_duplicates(["hj", "key"])


def build_items(freq, entries, pattern, keep=lambda row: True):
    cand = freq[freq["key"].str.match(pattern)]
    merged = cand.merge(entries, left_on=["hanji", "key"], right_on=["hj", "key"])
    merged = merged.sort_values("freq", ascending=False).drop_duplicates("key")
    items = []
    for row in merged.itertuples():
        if not keep(row):
            continue
        parts = [parse_syllable(s) for s in row.key.split("-")]
        if any(p is None for p in parts):
            print("略過：", row.hanji, row.key)
            continue
        items.append({
            "s": ud.normalize("NFC", row.key),
            "h": row.hanji,
            "a": str(row.羅馬字音檔檔名),
            "f": int(row.freq),
            "p": parts,
        })
    return items


FIELD_NOTE = "s 羅馬字 h 漢字 a 音檔檔名 f 詞頻 p 各音節 [聲母, 韻母, 調號, 調符所在字母位置（-1 無調符）]"
SANDHI_NOTE = (
    FIELD_NOTE + "\n// sd 前字變調後的音值 rule 依規則的變調記法 sd0 規則原本的音值（有人工修改時才有）"
    "\n// rv 人工檢查結果 ok 確認 edit 修改 exclude 排除；x 為 1 表示不出題；nt 備註"
)


def write_js(path: Path, var_name: str, items, note=FIELD_NOTE):
    body = ",\n".join(json.dumps(it, ensure_ascii=False, separators=(",", ":")) for it in items)
    path.write_text(
        "// 由 scripts/build_tone_data.py 產生，請勿手動修改\n"
        f"// {note}\n"
        f"window.{var_name} = [\n{body}\n];\n",
        encoding="utf-8",
    )
    print(f"{len(items)} 筆 → {path.relative_to(ROOT)}")


# ---------- 雙音節前字變調 ----------

SANDHI_RULES = {
    1: ("33", "1→7"),
    2: ("55", "2→1"),
    3: ("53", "3→2"),
    5: ("33", "5→7"),  # 漳腔；泉腔為 11（5→3），辭典音檔以漳腔為範例
    7: ("11", "7→3"),
}
CITATION_TONES = {1, 2, 3, 4, 5, 7, 8}
PITCH_RE = re.compile(r"^[1-5]{2}0?$")


def sandhi_of(tone: int, final: str):
    if tone == 4:
        return ("53", "4h→2") if final.endswith("h") else ("550", "4ptk→高促")
    if tone == 8:
        return ("11", "8h→3") if final.endswith("h") else ("110", "8ptk→低促")
    return SANDHI_RULES.get(tone)


def load_sandhi_overrides() -> dict:
    """讀取人工檢查結果；處理欄為 確認／修改／排除，修改時以「前字變調」欄的音值為準。"""
    if not SANDHI_OVERRIDES.exists():
        return {}
    overrides = {}
    with SANDHI_OVERRIDES.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            audio = (row.get("音檔") or "").strip()
            action = (row.get("處理") or "").strip()
            if not audio or action not in ("確認", "修改", "排除"):
                continue
            pitch = (row.get("前字變調") or "").strip()
            if action == "修改" and not PITCH_RE.match(pitch):
                print(f"修正檔音值格式不對，略過：{audio} {pitch}")
                continue
            overrides[audio] = (action, pitch, (row.get("備註") or "").strip())
    print(f"讀入 {len(overrides)} 筆人工檢查結果 ← {SANDHI_OVERRIDES.relative_to(ROOT)}")
    return overrides


def build_sandhi_items(doubles):
    """每條變調規則各取詞頻最高的 SANDHI_PER_RULE 個詞，讓少見的規則也有足夠題目。"""
    overrides = load_sandhi_overrides()
    items = []
    per_rule = {}
    for it in doubles:
        (_, final1, tone1, _), (_, _, tone2, _) = it["p"]
        rule = sandhi_of(tone1, final1)
        if rule is None or tone2 not in CITATION_TONES:
            continue
        per_rule[rule[1]] = per_rule.get(rule[1], 0) + 1
        if per_rule[rule[1]] > SANDHI_PER_RULE:
            continue
        entry = dict(it, sd=rule[0], rule=rule[1])
        action, pitch, note = overrides.get(it["a"], (None, None, ""))
        if action == "確認":
            entry["rv"] = "ok"
        elif action == "修改":
            entry.update(sd=pitch, sd0=rule[0], rv="edit")
        elif action == "排除":
            entry.update(rv="exclude", x=1)
        if note:
            entry["nt"] = note
        items.append(entry)
    print("各規則詞數：", {r: min(n, SANDHI_PER_RULE) for r, n in per_rule.items()})
    return items


def main():
    freq = load_freq()
    entries = load_entries()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    singles = build_items(freq, entries, SINGLE_RE)
    write_js(OUT_DIR / "tone-syllables.js", "TONE_SYLLABLES", singles)

    doubles = build_items(
        freq, entries, DOUBLE_RE,
        keep=lambda row: row.key.split("-")[1] != "á" and not row.hanji.endswith("仔"),
    )
    write_js(OUT_DIR / "tone-words.js", "TONE_WORDS", doubles[:DOUBLE_LIMIT])
    write_js(OUT_DIR / "sandhi-words.js", "SANDHI_WORDS", build_sandhi_items(doubles), SANDHI_NOTE)


if __name__ == "__main__":
    main()
