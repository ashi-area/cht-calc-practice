"""Count Spaced Repetition (st3v3nmw) flashcards in Obsidian notes.

Assumes plugin settings: inline `::` / reversed `:::`, multiline `?` / reversed `??`,
curly-brace clozes ON, highlight and bold clozes OFF, no end-of-card marker
(so a blank line ends a multiline card).

Usage: python -I count_cards.py <note.md> [...]
Reports cards inside the `## 卡片` section and any that would be detected outside it.
"""
import re
import sys

CLOZE = re.compile(r"\{\{.+?\}\}")
EXPECTED = re.compile(r"預期共\s*(\d+)\s*張卡")


def blocks(lines):
    """Yield (section, [lines]) paragraphs separated by blank lines, skipping code fences."""
    section, buf, in_code = "", [], False
    for line in lines:
        if line.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        if line.startswith("#") and re.match(r"^#{1,6} ", line):
            if buf:
                yield section, buf
                buf = []
            section = line.strip()
            continue
        if line.strip() == "":
            if buf:
                yield section, buf
                buf = []
            continue
        buf.append(line)
    if buf:
        yield section, buf


def count_block(buf):
    """Return list of (kind, n, text) cards found in one paragraph."""
    found = []
    stripped = [l.strip() for l in buf]
    if "??" in stripped:
        found.append(("multiline-reversed", 2, buf[0]))
        return found
    if "?" in stripped:
        found.append(("multiline", 1, buf[0]))
        return found
    inline = False
    for l in buf:
        if ":::" in l:
            found.append(("inline-reversed", 2, l)); inline = True
        elif "::" in l:
            found.append(("inline", 1, l)); inline = True
    if not inline:
        n = len(CLOZE.findall("\n".join(buf)))
        if n:
            found.append(("cloze", n, buf[0]))
    return found


def main(paths):
    ok = True
    for path in paths:
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
        inside, outside, kinds, expected = 0, [], {}, None
        for section, buf in blocks(lines):
            m = EXPECTED.search(" ".join(buf))
            if m:
                expected = int(m.group(1))
            for kind, n, text in count_block(buf):
                if section == "## 卡片":
                    inside += n
                    kinds[kind] = kinds.get(kind, 0) + n
                else:
                    outside.append((section, kind, text))
        text = "\n".join(lines)
        print(f"== {path}")
        print(f"   卡片區卡片數: {inside}  {kinds}")
        print(f"   筆記寫的預期數: {expected}")
        if expected != inside:
            ok = False
            print("   !! 預期數和實際數不一致")
        if outside:
            ok = False
            print("   !! 卡片區以外偵測到卡片：")
            for s, k, t in outside:
                print(f"      [{s}] {k}: {t}")
        hl = len(re.findall(r"==[^=\n]+==", text))
        print(f"   ==螢光筆== 出現 {hl} 次（外掛須關閉螢光筆填空）")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main(sys.argv[1:])
