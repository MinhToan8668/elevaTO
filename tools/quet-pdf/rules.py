# -*- coding: utf-8 -*-
"""
rules.py — bản Python của rules.js (cùng logic, cùng config.json) cho quet_pdf.py.
Nhận diện loại văn bản + trích Số / Ngày / Tên / Nội dung từ text (OCR hoặc lớp text)
của giấy tờ pháp lý, hồ sơ tín dụng tiếng Việt. So khớp trên chữ KHÔNG DẤU (norm) nên OCR
sai dấu vẫn bắt được. Sửa cấu hình ở config.json; thêm loại văn bản ở RULES cuối file.
"""
import json
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

CONFIG = json.loads((Path(__file__).resolve().parent / "config.json").read_text(encoding="utf-8"))
KNOWN_COMPANIES, TITLE_MAP, VN_WORDS, VN_PHRASES = (CONFIG[k] for k in ("KNOWN_COMPANIES", "TITLE_MAP", "VN_WORDS", "VN_PHRASES"))
ABBREV = [(re.compile(r"h[ộo]i [đd][ồo]ng qu[ảaá]n tr[ịi]", re.I), "HĐQT"), (re.compile(r"h[ộo]i [đd][ồo]ng th[àa]nh vi[êe]n", re.I), "HĐTV"),
          (re.compile(r"[đd][ạa]i h[ộo]i [đd][ồo]ng c[ổo] [đd][ôo]ng", re.I), "ĐHĐCĐ"), (re.compile(r"(\d{4})\s*[-–—]\s*(\d{4})"), r"\1-\2")]

# ------------------------------------------------------------------ 2. tiện ích
def strip_accents(s: str) -> str:
    s = s.replace("Đ", "D").replace("đ", "d")
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

def norm(s: str) -> str:
    return re.sub(r"\s+", " ", strip_accents(s or "").lower()).strip()

def fuzzy(s: str) -> str:  # gộp chữ lặp do OCR ("ĐIÊỀU" -> "dieeu" -> "dieu")
    return re.sub(r"([a-z])\1+", r"\1", norm(s))

def lines_of(t: str) -> list[str]:
    return [re.sub(r"\s+", " ", l).strip() for l in (t or "").splitlines() if l.strip()]

def head_norm(t: str, n: int = 25) -> str:
    return norm(" ".join(lines_of(t)[:n]))

def letters(s: str) -> list[str]:
    return [c for c in s if c.isalpha()]

def upper_ratio(l: str) -> float:
    L = letters(l)
    return sum(c.isupper() for c in L) / len(L) if L else 0.0

def is_upper_line(l: str, r: float = 0.8) -> bool:
    return len(letters(l)) >= 3 and upper_ratio(l) >= r

def sentence(s: str) -> str:
    s = (s or "").strip()
    return s[:1].upper() + s[1:] if s else s

def vn_title(s: str) -> str:
    return " ".join(w[0] + w[1:].lower() if (w == w.upper() and w != w.lower()) else w for w in (s or "").split(" ") if w)

def abbrev(s: str) -> str:
    for re_, rep in ABBREV:
        s = re_.sub(rep, s or "")
    return s

def clean_edge(s: str) -> str:
    return re.sub(r"^[\s|:!;.\-_'`\"“”„,]+|[\s|:!;.\-_'`\"“”„,]+$", "", s or "")

def filename_stem(name: str) -> str:
    return re.sub(r"^\s*\d+\s*[.\-_)]\s*", "", re.sub(r"\.[^.]+$", "", name or ""))

def reaccent(s: str) -> str:
    n = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9/&\-.,() ]", " ", norm(s))).strip()
    words, out, i = n.split(" "), [], 0
    while i < len(words):
        hit = None
        for k, v in VN_PHRASES:
            kl = k.split(" ")
            if " ".join(words[i:i + len(kl)]) == k:
                hit = (v, len(kl)); break
        if hit:
            out.append(hit[0]); i += hit[1]
        else:
            out.append(VN_WORDS.get(words[i], words[i])); i += 1
    return " ".join(out)

# ------------------------------------------------------------------ 3. tiêu đề văn bản
DOC_KEYWORDS = ["bao cao", "to trinh", "cong van", "thong bao", "de xuat", "de nghi", "bien ban", "hop dong", "giay ", "quyet dinh",
                "nghi quyet", "phu luc", "dieu le", "danh sach", "so dang ky", "khe uoc", "uy nhiem chi", "hoa don", "chung chi", "chung nhan", "van ban",
                "thu ", "phieu", "bang ke", "ke hoach", "phuong an", "cam ket", "thoa thuan", "xac nhan", "ban cam ket", "don ", "the ", "ho so", "bang "]
SKIP_TITLE = ["cong hoa xa hoi", "doc lap", "socialist", "independence", "hanh phuc", "freedom"]
NOT_TITLE = re.compile(r"^(cong ty|ctcp|ngan hang|so ke hoach|uy ban|chi nhanh|khoi |phong |ban |so:|so |no\.|ngay|tp\.|tp |ha noi|hanoi|kinh gui|can cu|dvkd|\d|v\/v|ve viec|hom nay|ma so|dia chi|khach hang)")
SO_LABEL = re.compile(r"(?:^|\s)S[ốóòõọôỗộ6oáàăâếe](?:\s*\/\s*No\.?)?(?:[il1]?\s*[:;.,]|[il1]?\s)\s*", re.I)

def is_header_line(l: str) -> bool:
    n = norm(l)
    return (any(s in n for s in SKIP_TITLE) or bool(SO_LABEL.search(" " + l))
            or bool(re.search(r",\s*ng[àa]y\s*\d{1,2}\s*th[áa]ng\s*\d{1,2}\s*n[ăa]m\s*\d{4}\s*\.?$", l, re.I))
            or bool(re.match(r"^(so|no\.)\s*[:.]", n)))

def is_label_line(l: str) -> bool:
    return bool(re.match(r"^[^:]{1,40}:\s*\S", l)) and not re.match(r"^(quyet dinh|nghi quyet|thong bao|bao cao)", norm(l))

def starts_with_doc_kw(l: str) -> bool:
    f = fuzzy(l)
    return any(f.startswith(k) for k in DOC_KEYWORDS)

def title_blocks(ls: list[str]) -> list[dict]:
    blocks, cur, mixed_run, started_mixed = [], None, 0, False
    def close():
        nonlocal cur
        if cur and cur["parts"]:
            blocks.append(cur)
        cur = None
    for i, line in enumerate(ls):
        raw = clean_edge(line)
        if not raw:
            close(); continue
        n = norm(raw)
        if any(k in n for k in SKIP_TITLE) or (SO_LABEL.search(" " + raw) and n.startswith("s")):
            close(); continue
        is_up = is_upper_line(raw)
        is_kw = starts_with_doc_kw(raw) and not NOT_TITLE.match(n) and not is_label_line(raw)
        if cur:
            if is_up and not is_label_line(raw) and not re.match(r"^(so|no\.)\s*[:.]", n) and len(letters(raw)) >= 3:
                cur["parts"].append(raw); mixed_run = 0; continue
            if (not is_up and started_mixed and mixed_run < 2 and ":" not in raw and not NOT_TITLE.match(n)
                    and not re.search(r"\d{1,2}\/\d{1,2}\/\d{4}", raw) and len(raw) > 3):
                cur["parts"].append(raw); mixed_run += 1; continue
            close()
        if (is_up and not NOT_TITLE.match(n) and not is_label_line(raw) and len(letters(raw)) >= 4) or is_kw:
            cur = {"idx": i, "parts": [raw]}; started_mixed = not is_up; mixed_run = 0
    close()
    for b in blocks:
        b["parts"] = [p for p in (re.sub(r"\s+S[ốo]\s*[:.].*$", "", p, flags=re.I).strip() for p in b["parts"]) if p]
    return [b for b in blocks if b["parts"]]

def title_block(text: str, max_lines: int = 20) -> list[str]:
    ls = lines_of(text)[:max_lines]
    blocks = title_blocks(ls)
    if not blocks:
        return []
    hdr_end = -1
    for i, l in enumerate(ls[:12]):
        if is_header_line(l):
            hdr_end = i
    kw = next((b for b in blocks if starts_with_doc_kw(b["parts"][0])), None)
    if kw:
        return kw["parts"]
    after = next((b for b in blocks if b["idx"] > hdr_end), None)
    return (after or blocks[0])["parts"]

def title_norm(text: str) -> str:
    return fuzzy(" ".join(title_block(text)))

def title_text(text: str, max_parts: int = 3) -> str:
    parts = title_block(text)[:max_parts]
    if not parts:
        return ""
    raw = " ".join(parts); n = norm(raw)
    for k, v in TITLE_MAP:
        if n.startswith(k):
            rest = raw[len(k):]
            return v + (reaccent(rest) if upper_ratio(rest) > 0.8 else rest)
    return sentence(reaccent(raw) if upper_ratio(raw) > 0.8 else raw)

# ------------------------------------------------------------------ 4. tên công ty
LOAI_RE = r"(co phan|tnhh(?: mot thanh vien| mtv| hai thanh vien tro len)?|hop danh)"
NAME_STOP = (r"(?=$|[,;:(\"“”)]| thong qua| nhu sau| duoc | co | va | la | ngay | theo | tai | ve | ban hanh| kinh gui| cong hoa| doc lap| ma so| dia chi"
             r"| tru so| von dieu| dang ky| giay chung| so:| sau day| to chuc| hop| quyet dinh| nghi quyet| bien ban| dieu le| tran trong| kinh de nghi|\.)")
NAME_RE = re.compile(r"cong ty " + LOAI_RE + r" ([a-z0-9&.\- ]{3,80}?)" + NAME_STOP)

def loai_label(g: str) -> str:
    if g == "co phan":
        return "Cổ phần"
    if g == "hop danh":
        return "Hợp danh"
    return "TNHH" + {" mot thanh vien": " Một thành viên", " mtv": " MTV", " hai thanh vien tro len": " Hai thành viên trở lên"}.get(g[4:], "")

def known_company(scope: str, short: bool = False) -> str:
    n = norm(scope)
    for c in KNOWN_COMPANIES:
        if any(k in n for k in c["keys"]):
            return c["short"] if short else c["full"]
    return ""

def company_name(text: str, limit: int = 6000, short: bool = False) -> str:
    ls = lines_of(text[:limit])
    cands = ls + [ls[i] + " " + ls[i + 1] for i in range(len(ls) - 1)]
    found = []
    for l in cands:
        wvn, n = l.split(" "), norm(l)
        wnd = n.split(" ")
        for m in NAME_RE.finditer(n):
            key = m.group(2).strip()
            if len(key) < 3:
                continue
            kc = known_company("cong ty " + m.group(1) + " " + key, short)
            if kc:
                return kc
            seg, upper = key, False
            if len(wvn) == len(wnd):
                start_w = len(n[: m.start() + len("cong ty " + m.group(1) + " ")].split(" ")) - 1
                seg_vn = clean_edge(" ".join(wvn[start_w:start_w + len(key.split(" "))]))
                upper = upper_ratio(seg_vn) >= 0.5
                seg = vn_title(seg_vn) if upper else seg_vn
            found.append((m.group(1) + "|" + key, seg, upper))
    if not found:
        return known_company(text[:limit], short) or ""
    cnt = Counter(k for k, _, _ in found)
    best = max(cnt, key=lambda k: (cnt[k], len(k)))
    vs = sorted([(u, s) for k, s, u in found if k == best], key=lambda v: (v[0], -len(v[1])))
    ten = re.sub(r"(?iu)\s+(Mã Số|Địa Chỉ|Số \d|Trụ Sở|Vốn Điều|Đăng Ký|Giấy Chứng|Cộng Hòa|Độc Lập).*$", "", vs[0][1])
    loai = loai_label(best.split("|")[0])
    if short:
        return f"{'CTCP' if loai == 'Cổ phần' else 'Công ty ' + loai} {ten}".strip()
    return f"Công ty {loai} {ten}".strip()

def other_company(text: str, main: str) -> str:
    main_n = norm(main or "")
    one = re.compile(r"cong ty " + LOAI_RE + r" ([a-z0-9&.\- ]{3,60}?)" + NAME_STOP)
    for l in lines_of(text)[:40]:
        n = norm(l)
        m = one.search(n)
        if not m:
            continue
        full = "cong ty " + m.group(1) + " " + m.group(2).strip()
        if main_n and (m.group(2).strip() in main_n or re.sub(r"^cong ty ", "", main_n) in full):
            continue
        kc = known_company(full, True)
        if kc:
            return kc
        idx = n.index("cong ty")
        seg = " ".join(l.split(" ")[len(n[:idx].split(" ")) - (1 if idx else 0):])
        t = vn_title(clean_edge(re.split(r"[,;(]|Địa chỉ|địa chỉ", seg)[0]))
        for a, b in [("Công Ty", "Công ty"), ("Tnhh", "TNHH"), ("Cổ Phần", "Cổ phần"), ("Cỏ Phần", "Cổ phần"), ("Cổ Phàn", "Cổ phần"), ("Cỏ Phàn", "Cổ phần"), ("Cô Phần", "Cổ phần"), ("Cổ Phản", "Cổ phần"), (" Mtv", " MTV")]:
            t = t.replace(a, b)
        return t
    return ""

# ------------------------------------------------------------------ 5. ngày
@dataclass
class D:
    d: int; m: int; y: int
    def fmt(self) -> str:
        return f"{self.d:02d}/{self.m:02d}/{self.y}"

def mk(d, m, y) -> Optional[D]:
    d, m, y = int(d), int(m), int(y)
    return D(d, m, y) if 1 <= d <= 31 and 1 <= m <= 12 and 1990 <= y <= 2099 else None

fmt_date = lambda x: x.fmt() if x else ""  # noqa: E731

def find_dates(text: str) -> list[D]:
    f = [(m.start(), m.group(1), m.group(2), m.group(3)) for m in re.finditer(r"ng[àa]y\s*(\d{1,2})\s*[,.]?\s*th[áa]ng\s*(\d{1,2})\s*[,.]?\s*n[ăa]m\s*(\d{4})", text or "", re.I)]
    f += [(m.start(), m.group(1), m.group(2), m.group(3)) for m in re.finditer(r"(?<!\d)(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})(?!\d)", text or "")]
    return [d for d in (mk(*x[1:]) for x in sorted(f)) if d]

def first_date(text: str) -> Optional[D]:
    ds = find_dates(text)
    return ds[0] if ds else None

def date_from_filename(name: str) -> Optional[D]:
    name = name or ""
    for m in re.finditer(r"(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)", name):
        d = mk(m.group(3), m.group(2), m.group(1))
        if d: return d
    for m in re.finditer(r"(?<!\d)(\d{2})(\d{2})(\d{2})(?!\d)", name):
        d = mk(m.group(3), m.group(2), "20" + m.group(1))
        if d and int(m.group(1)) <= 40: return d
    for m in re.finditer(r"(?<!\d)(\d{1,2})[ ._\-](\d{1,2})[ ._\-](20\d{2})(?!\d)", name):
        d = mk(m.group(1), m.group(2), m.group(3))
        if d: return d
    return None

SKIP_DATE = ["het han", "hieu luc", "ngay cap", "ngay sinh", "cap ngay", "ban hanh", "kem theo", "can cu", "theo hop dong", "theo nghi quyet", "theo quyet dinh", "ket thuc", "sinh ngay", "ngay het"]
REF_BEFORE = re.compile(r"s[ốo]\s*[:.]?\s*\S*[\/\-]\S*\s*(,\s*)?ng[àa]y\s*$", re.I)

def line_date(l: str) -> Optional[D]:
    n = norm(l)
    if any(k in n for k in SKIP_DATE):
        return None
    for m in re.finditer(r"ng[àa]y\s*\d{1,2}\s*[,.]?\s*th[áa]ng|(?<!\d)\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{4}", l, re.I):
        if REF_BEFORE.search(l[max(0, m.start() - 40):m.start()]):
            continue
        ds = find_dates(l[m.start():])
        if ds: return ds[0]
    return None

def header_date(text: str, n: int = 10) -> Optional[D]:
    for l in lines_of(text)[:n]:
        d = line_date(l)
        if d: return d
    return None

def place_date(text: str) -> Optional[D]:
    for l in lines_of(text):
        if re.search(r",\s*ng[àa]y\s*\d{1,2}\s*th[áa]ng", l, re.I) or re.match(r"^h[ôo]m nay,?\s*ng[àa]y", l, re.I):
            d = line_date(l)
            if d: return d
    return None

def date_after(text: str, label_re: str, n_lines: int = 40) -> Optional[D]:
    for l in lines_of(text)[:n_lines]:
        m = re.search(label_re, l, re.I)
        if m:
            ds = find_dates(l[m.end():])
            if ds: return ds[0]
    return None

def best_date(text: str, name: str, label_re: Optional[str] = None) -> tuple[Optional[D], str]:
    if label_re:
        d = date_after(text, label_re)
        if d: return d, "văn bản"
    d = header_date(text)
    if d: return d, "văn bản"
    d = place_date(text)
    if d: return d, "văn bản"
    d = date_from_filename(name)
    if d: return d, "tên file"
    d = first_date(text)
    if d: return d, "trong nội dung – kiểm tra!"
    return None, ""

# ------------------------------------------------------------------ 6. số văn bản
NUM_FALLBACK = re.compile(r"(\S{1,8}?)\s*\.?\s*\/\s*(20\d{2})\s*[\/.\]]+\s*([A-ZĐ][A-ZĐa-z]{0,8}(?:\s*[-–]\s*[A-ZĐ]{1,10})?(?:\s*\/\s*[A-ZĐ\-]{1,12})*)")
VIB_NUM = re.compile(r"(?<!\d)(\d{6,8}\.\d{2})(?!\d)")
VIB_NUM2 = re.compile(r"(?<![\d\/])(\d{1,3}\/\d{2,4})[\s_.]{0,3}(20\d{6})[\s_.]{0,3}([A-Z]{1,3})\b")

def vib_num2(l: str) -> str:
    m = VIB_NUM2.search(l)
    return f"{m.group(1)}_{m.group(2)}_{m.group(3)}" if m else ""

def number_hint_from_filename(name: str) -> str:
    n = norm(filename_stem(name).replace("_", " "))
    m = re.search(r"(?:(?:^|\s)s[ốo](?=\s|\d)|(?:^|\s)hd(?=\s|\d)|(?:^|\s)guq|(?:^|\s)nq|(?:^|\s)qd|(?:^|\s)bb(?=\s|\d)|(?:^|\s)gnn|(?:^|\s)hdxd|(?:^|\s)kunn|(?:^|\s)cv(?=\s|\d))[\s\-.]*(\d{1,4})(?!\d)", n)
    return m.group(1) if m else ""

def fix_leading(s: str, hint: str) -> str:
    s = s.replace("Ð", "Đ").replace("ĐĐ", "Đ").replace("ĐỌM", "ĐQM").replace("ĐOM", "ĐQM")
    s = re.sub(r"(\d)\.{2,}(20\d{2})", r"\1/\2", s); s = re.sub(r"(20\d{2})[.\]]+(?=[A-ZĐ])", r"\1/", s)
    i = s.find("/")
    head, rest = (s, "") if i < 0 else (s[:i], s[i:])
    if hint and (not re.fullmatch(r"\d+", head) or head.lstrip("0") != hint.lstrip("0")):
        head = hint
    else:
        head = re.sub(r"[^0-9A-Za-zĐ]", "", re.sub(r"[lI|]", "1", re.sub(r"[Oo]", "0", head)))
    return head + rest

def doc_number(text: str, name: str = "") -> str:
    hint = number_hint_from_filename(name) if name else ""
    ls = lines_of(text)
    for scope in (ls[:15], ls[15:60]):
        for l in scope:
            m = SO_LABEL.search(l)
            if m:
                rest = l[m.end():]
                mv = VIB_NUM.search(rest[:20])
                if mv: return mv.group(1)
                mv2 = vib_num2(rest)
                if mv2: return mv2
                acc = []
                for t in rest.split():
                    if not re.fullmatch(r"[\wÀ-ỹ.\-\/]+", t):
                        break
                    ok = "/" in t or "-" in t or t in ("-", "/") or (acc and re.search(r"[\/-]$", acc[-1])) or (not acc and re.match(r"^[\d.]", t))
                    if not ok:
                        break
                    acc.append(t)
                if acc:
                    s = re.sub(r"^[.\-\/]+|[.\-\/]+$", "", re.sub(r"(?<=[\/-])\.+", "", re.sub(r"\.+(?=[\/-])", "", "".join(acc))))
                    if re.fullmatch(r"\d{1,2}\/\d{1,2}\/\d{4}", s):
                        continue
                    if re.search(r"\d", s) and re.search(r"[\/-]", s):
                        return fix_leading(s, hint)
            m2 = NUM_FALLBACK.search(l)
            if m2:
                return fix_leading(re.sub(r"\s+", "", f"{m2.group(1)}/{m2.group(2)}/{m2.group(3)}"), hint)
    for l in ls[:15]:
        v = vib_num2(l)
        if v: return v
    return ""

# ------------------------------------------------------------------ 7. nội dung
VV = [r"^V\/v\b", r"^V[ềe] vi[ệe]c\b", r"^V[ềe]\s*:", r"^V[^\s:]{0,3}:", r"^Trích y[ếe]u\s*:", r"^Subject\s*:"]

def line_after(text: str, patterns=VV, maxlen: int = 200) -> str:
    ls = lines_of(text)
    for i, l in enumerate(ls[:40]):
        for p in patterns:
            m = re.match(p, l, re.I)
            if m:
                rest = re.sub(r"^[\s:.\-–]+|[\s:.\-–]+$", "", l[m.end():])
                if not rest and i + 1 < len(ls):
                    rest = ls[i + 1]
                return re.split(r"\s*\/\s*(?=[A-Z][a-z])", rest)[0][:maxlen]
    return ""

def vv_line(text: str) -> str:
    return re.sub(r"(?i)\s+(Độc lập|Doc lap|CỘNG HÒA).*$", "", line_after(text)).strip()

def kinh_gui(text: str) -> str:
    return re.sub(r"(?i)\s+(Độc lập|CỘNG HÒA).*$", "", line_after(text, [r"^K[íi]nh g[ửu]i\s*:?"]) or "")

def ky_bao_cao(text: str) -> str:
    m = re.search(r"(?:ky|thoi ky|ky ket thuc|ky kiem tra|ky bao cao|thang|quy|nam)\s*(?:bao cao|kiem tra)?\s*[:.]?\s*((?:quy|thang|nam|q)?\s*[ivx\d]{1,4}\s*[\/\-]?\s*(?:20\d{2})?)", norm(text[:3000]))
    if not m or not re.search(r"\d{4}|quy|thang", m.group(1)):
        return ""
    s = re.sub(r"\s+", " ", m.group(1)).strip()
    s = re.sub(r"^quy", "Quý", s); s = re.sub(r"^thang", "Tháng", s); s = re.sub(r"^nam", "Năm", s); s = re.sub(r"^q\s*", "Quý ", s)
    return re.sub(r"\b[ivx]{1,4}\b", lambda r: r.group(0).upper(), sentence(s))

def von_dieu_le(text: str) -> str:
    m = re.search(r"v[ốoôỗ]n [đd]i[ềeêể]u l[ệeê][^\d]{0,60}((?:\d{1,3}\.)+\d{3}|\d[\d.,]*)\s*(t[ỷy]|tri[ệe]u|[đd][ồo]ng|VN[ĐD])?", text, re.I)
    if not m or len(re.sub(r"\D", "", m.group(1))) < 4:
        return ""
    n = norm(m.group(2) or "dong")
    dv = "tỷ" if n == "ty" else "triệu" if n == "trieu" else "đồng"
    return f"Vốn điều lệ {m.group(1).strip('.,')} {dv} đồng".replace("đồng đồng", "đồng")

def sua_doi_dieu(text: str) -> str:
    m = re.search(r"sua doi(,? bo sung)? (khoan [\d.]+ )?(dieu \d+)", norm(text[:4000]))
    if not m:
        return ""
    return ("Sửa đổi" + (", bổ sung" if m.group(1) else "") + " " + (m.group(2) or "") + m.group(3)).replace("dieu", "Điều").replace("khoan", "khoản")

def chuc_vu_list(text: str) -> list[str]:
    out = []
    for l in lines_of(text):
        m = re.search(r"ch[ứu]c v[ụu]\s*[:.]?\s*(.+)", l, re.I)
        if not m: continue
        cv = re.split(r"\s+và\s+|\s*[-–—]+\s+|\s*\/\s+|[,(.;]", m.group(1))[0].strip()
        if cv:
            out.append(sentence(abbrev(cv).lower()).replace("hđqt", "HĐQT").replace("hđtv", "HĐTV"))
    return out

# ------------------------------------------------------------------ 8. rule từng loại
@dataclass
class Fields:
    so: str = ""
    ngay: Optional[D] = None
    ten: str = ""
    noi_dung: str = ""
    nguon_ngay: str = ""
    loai: str = ""

def with_date(f: Fields, text: str, name: str, label_re: Optional[str] = None) -> Fields:
    if f.ngay:
        f.nguon_ngay = f.nguon_ngay or "văn bản"
        return f
    f.ngay, f.nguon_ngay = best_date(text, name, label_re)
    return f

def r_gcn(text, name, ctx=None):
    m = re.search(r"thay [đd][ổo]i l[ầa]n th[ứu]\s*:?\s*(\d+)\s*[,:]?\s*(ng[àa]y\s*\d{1,2}\s*th[áa]ng\s*\d{1,2}\s*n[ăa]m\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})?", text, re.I)
    lan = m.group(1) if m else ""
    ngay = (find_dates(m.group(2)) or [None])[0] if m and m.group(2) else None
    if not ngay and not lan:
        ngay = date_after(text, r"[đd][ăa]ng k[ýy] l[ầa]n [đd][ầa]u\s*:?")
    hn = head_norm(text)
    loai = "Công ty Cổ phần" if "cong ty co phan" in hn else "Công ty TNHH" if "cong ty tnhh" in hn else ""
    cty = company_name(text, limit=3000)
    nd = " – ".join(x for x in [f"Đăng ký thay đổi lần thứ {lan}" if lan else "Đăng ký lần đầu", cty] if x)
    return with_date(Fields("", ngay, f"Giấy chứng nhận đăng ký doanh nghiệp {loai}".strip(), nd), text, name)

def r_cccd(text, name, ctx=None):
    nm = ""
    for l in lines_of(text):
        m = re.search(r"(?:h[ọo] v[àa] t[êe]n|full name)\s*[:\/]*\s*(.*)$", l, re.I)
        if m and m.group(1).strip():
            nm = vn_title(re.sub(r"(?i)^\/?\s*Full name\s*:?\s*", "", m.group(1)).strip()); break
    if not nm:
        nm = vn_title(re.sub(r"^[\s\-.]+|[\s\-.]+$", "", re.sub(r"\s+", " ", re.sub(r"(?i)c[ăa]n c[ưu][ớo]c( c[ôo]ng d[âa]n)?|cccd|cmnd", " ", filename_stem(name).replace("_", " ")))))
    m = re.search(r"(?<!\d)(\d{12})(?!\d)", text)
    so = m.group(1) if m else ""
    if not so and ctx and ctx.get("ocr_id_number"):
        so = ctx["ocr_id_number"]()
    return Fields("", None, f"CCCD {nm}".strip(), f"Số {so}" if so else "")

def r_nq(co_quan: str):
    def f(text, name, ctx=None):
        ten = " ".join(x for x in ["Nghị quyết", co_quan, company_name(text)] if x)
        return with_date(Fields(doc_number(text, name), None, ten, abbrev(vv_line(text))), text, name)
    return f

def r_guq(text, name, ctx=None):
    cv = chuc_vu_list(text)
    return with_date(Fields(doc_number(text, name), None, "Giấy ủy quyền", f"{cv[0]} ủy quyền cho {cv[1]}" if len(cv) >= 2 else vv_line(text)), text, name)

def r_qd(text, name, ctx=None):
    nd, ten = abbrev(vv_line(text)), "Quyết định"
    hn = head_norm(text)
    if "bo nhiem" in hn:
        ten = "Quyết định bổ nhiệm"
        if not nd:
            m = re.search(r"[Bb]ổ nhiệm\s+(?:ông|bà|Ông|Bà)?\s*([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s[A-ZÀ-Ỹ][a-zà-ỹ]+){1,4})", text)
            if m: nd = f"Bổ nhiệm {m.group(1)}"
    elif "mien nhiem" in hn:
        ten = "Quyết định miễn nhiệm"
    cq = "HĐQT" if "hoi dong quan tri" in hn else "HĐTV" if "hoi dong thanh vien" in hn else "Chủ sở hữu" if "chu so huu" in hn else ""
    return with_date(Fields(doc_number(text, name), None, " ".join(x for x in [ten, "của " + cq if cq else "", company_name(text)] if x), nd), text, name)

def r_chung_chi(text, name, ctx=None):
    return with_date(Fields(doc_number(text, name), None, "Chứng chỉ năng lực hoạt động xây dựng", company_name(text, short=True)), text, name)

def r_pl_dieu_le(text, name, ctx=None):
    parts = [sua_doi_dieu(text)]
    v = von_dieu_le(text)
    if v:
        parts.append(v)
    elif re.search(r"nguoi dai dien theo phap luat", norm(text[:3000])):
        parts.append("Thay đổi người đại diện theo pháp luật")
    nd = " – ".join(p for p in parts if p) or abbrev(vv_line(text))
    return with_date(Fields(doc_number(text, name), None, f"Phụ lục sửa đổi Điều lệ {company_name(text)}".strip(), nd), text, name)

def r_dieu_le(text, name, ctx=None):
    m = re.search(r"sua doi,? bo sung lan thu (\d+)", norm(text[:6000]))
    nd = f"Sửa đổi, bổ sung lần thứ {m.group(1)}" if m else ""
    hl = re.search(r"c[óo] hi[ệeê]u l[ựu]c (?:k[ểe] )?t[ừu] ng[àa]y\s*([\d\/\-.]+)", text, re.I)
    ngay = (find_dates(hl.group(0)) or [None])[0] if hl else None
    if ngay and not nd:
        nd = f"Có hiệu lực từ ngày {ngay.fmt()}"
    return with_date(Fields("", ngay, f"Điều lệ {company_name(text)}".strip(), nd), text, name)

def r_ds_co_dong(text, name, ctx=None):
    m = re.search(r"chot (?:den )?ngay\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})", norm(text))
    ngay = (find_dates(m.group(1)) or [None])[0] if m else None
    cty = company_name(text)
    ten = "Danh sách cổ đông" + (f" {cty}" if cty else "") + (f" chốt đến ngày {ngay.fmt()}" if ngay else "")
    return with_date(Fields("", ngay, ten, von_dieu_le(text)), text, name)

def r_so_co_dong(text, name, ctx=None):
    return with_date(Fields("", None, f"Sổ đăng ký cổ đông {company_name(text)}".strip(), ""), text, name)

def r_bctc(text, name, ctx=None):
    hn = head_norm(text, 12)
    loai = "hợp nhất" if "hop nhat" in hn else "riêng" if "rieng" in hn else ""
    m = re.search(r"k[ếe]t th[úu]c\s*(?:ng[àa]y\s*)?(\d{1,2}\s*th[áa]ng\s*\d{1,2}\s*n[ăa]m\s*\d{4}|ng[àa]y\s*\d{1,2}\s*th[áa]ng\s*\d{1,2}\s*n[ăa]m\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})", text, re.I)
    ngay = (find_dates(m.group(1) if m.group(1).lower().startswith("ng") else "ngày " + m.group(1)) or [None])[0] if m else None
    fn = norm(name)
    ten = " ".join(x for x in ["Báo cáo tài chính", loai, f"năm {ngay.y}" if ngay else ""] if x)
    if "kiem toan" in fn or "kiem toan" in hn:
        ten += " (đã kiểm toán)"
    elif "soat xet" in fn or "soat xet" in hn:
        ten += " (soát xét)"
    return with_date(Fields("", ngay, ten, company_name(text, short=True)), text, name)

def r_hop_dong(text, name, ctx=None):
    main = company_name(text); other = other_company(text, main)
    nd = " – ".join(x for x in [company_name(text, short=True), other] if x) or abbrev(vv_line(text))
    return with_date(Fields(doc_number(text, name), None, title_text(text) or "Hợp đồng", nd), text, name, r"h[ôo]m nay,?\s*(?=ng[àa]y)")

def r_ubtd(text, name, ctx=None):
    nd, cty = "", company_name(text, short=True)
    for l in lines_of(text):
        if re.search(r"\bcho KH\b", l):
            nd = re.sub(r"(?i)^n[ộo]i\s*d\S{0,4}\s*[:.„,]*\s*", "", re.split(r"\s*[(&]|\s+thu[ộo]c\b", l)[0].strip())
            if cty: nd = re.sub(r"cho KH\b.*$", f"cho KH {cty}", nd)
            break
    return with_date(Fields(doc_number(text, name), None, "Biên bản họp kèm phê duyệt của Ủy ban tín dụng", abbrev(nd) or cty), text, name, r"th[ờo]i gian\s*[:.]?\s*ng[àa]y")

def r_bcttd(text, name, ctx=None):
    so, ngay = "", None
    m = VIB_NUM2.search(text)
    if m:
        so = f"{m.group(1)}_{m.group(2)}_{m.group(3)}"
        ngay = (find_dates(text[m.end():m.end() + 60]) or [None])[0]
    return with_date(Fields(so or doc_number(text, name), ngay, "Báo cáo tái thẩm định", company_name(text, short=True)), text, name, r"^ng[àa]y\s*(?:l[ậa]p)?\s*[:.]")

def r_de_xuat(text, name, ctx=None):
    return with_date(Fields(doc_number(text, name), None, title_text(text) or "Đề xuất tín dụng", company_name(text, short=True)), text, name, r"ng[àa]y l[ậa]p\s*[:.]?")

def r_de_nghi_ctd(text, name, ctx=None):
    return with_date(Fields(doc_number(text, name), None, "Đề nghị cấp tín dụng kiêm phương án sử dụng vốn", company_name(text, short=True)), text, name)

def r_bien_ban(text, name, ctx=None):
    hn = head_norm(text)
    kind = ("Đại hội đồng cổ đông" if "dai hoi dong co dong" in hn else "Hội đồng quản trị" if "hoi dong quan tri" in hn
            else "Hội đồng thành viên" if "hoi dong thanh vien" in hn else "")
    ten = " ".join(x for x in ["Biên bản họp", kind, company_name(text)] if x) if kind else (title_text(text) or "Biên bản")
    return with_date(Fields(doc_number(text, name), None, ten, abbrev(vv_line(text)) or company_name(text, short=True)), text, name, r"h[ôo]m nay,?.*?(?=ng[àa]y)")

def r_khe_uoc(text, name, ctx=None):
    m = re.search(r"s[ốo] ti[ềe]n[^:\d]{0,30}[:.]?\s*([\d.,]{6,})\s*(đ[ồo]ng|VN[ĐD])?", text, re.I)
    nd = " – ".join(x for x in [company_name(text, short=True), m.group(1) if m else ""] if x)
    nd = re.sub(r"(\d)$", r"\1 đồng", nd)
    return with_date(Fields(doc_number(text, name), None, "Khế ước nhận nợ", nd), text, name, r"ng[àa]y nh[ậa]n n[ợo]\s*[:.]?")

def r_to_trinh(text, name, ctx=None):
    return with_date(Fields(doc_number(text, name), None, "Tờ trình", abbrev(vv_line(text)) or kinh_gui(text)), text, name)

def r_cong_van(text, name, ctx=None):
    return with_date(Fields(doc_number(text, name), None, "Công văn", abbrev(vv_line(text)) or kinh_gui(text)), text, name)

def r_thong_bao(text, name, ctx=None):
    return with_date(Fields(doc_number(text, name), None, "Thông báo", abbrev(vv_line(text))), text, name)

def r_bao_cao(text, name, ctx=None):
    nd = " – ".join(x for x in [company_name(text, short=True), ky_bao_cao(text)] if x)
    return with_date(Fields(doc_number(text, name), None, title_text(text) or "Báo cáo", nd or abbrev(vv_line(text))), text, name, r"ng[àa]y (?:l[ậa]p|ki[ểe]m tra|b[áa]o c[áa]o)\s*[:.]?")

def r_generic(text, name, ctx=None):
    ten = title_text(text) or sentence(reaccent(filename_stem(name).replace("_", " ")))
    return with_date(Fields(doc_number(text, name), None, ten, abbrev(vv_line(text)) or company_name(text, short=True)), text, name)

# ------------------------------------------------------------------ 9. phân loại
@dataclass
class Rule:
    name: str
    keys: list[str]
    fn: Callable
    not_keys: list[str] = field(default_factory=list)
    fname: list[str] = field(default_factory=list)

RULES = [
    Rule("GCN ĐKDN", ["giay chung nhan dang ky doanh nghiep"], r_gcn),
    Rule("GCN ĐKDN", ["giay chung nhan", "dang ky doanh nghiep"], r_gcn),
    Rule("GCN ĐKDN", [], r_gcn, fname=["dkdn", "dkkd", "gcn dkdn"]),
    Rule("CCCD", ["can cuoc"], r_cccd),
    Rule("CCCD", ["citizen identity"], r_cccd),
    Rule("CCCD", [], r_cccd, fname=["cccd", "cmnd", "can cuoc"]),
    Rule("BCTC", ["bao cao tai chinh"], r_bctc),
    Rule("BCTC", [], r_bctc, fname=["bctc"]),
    Rule("BB UBTD", ["bien ban hop kem phe duyet"], r_ubtd),
    Rule("BB UBTD", ["bien ban hop", "uy ban tin dung"], r_ubtd, ["de xuat"]),
    Rule("BCTTĐ", ["bao cao tai tham dinh"], r_bcttd),
    Rule("BCTTĐ", [], r_bcttd, fname=["bcttd"]),
    Rule("Đề nghị CTD", ["de nghi cap tin dung"], r_de_nghi_ctd),
    Rule("Đề xuất", ["de xuat"], r_de_xuat, ["hop dong"]),
    Rule("Đề xuất", [], r_de_xuat, fname=["dxtd", "dx thay doi", "dxctd"]),
    Rule("Khế ước", ["khe uoc"], r_khe_uoc),
    Rule("Khế ước", [], r_khe_uoc, fname=["kunn", "khe uoc"]),
    Rule("Phụ lục điều lệ", ["phu luc", "dieu le"], r_pl_dieu_le),
    Rule("NQ ĐHĐCĐ", ["nghi quyet", "dai hoi dong co dong"], r_nq("Đại hội đồng cổ đông")),
    Rule("NQ HĐQT", ["nghi quyet", "hoi dong quan tri"], r_nq("Hội đồng quản trị")),
    Rule("NQ HĐTV", ["nghi quyet", "hoi dong thanh vien"], r_nq("Hội đồng thành viên")),
    Rule("Nghị quyết", ["nghi quyet"], r_nq("")),
    Rule("Hợp đồng", ["hop dong"], r_hop_dong, ["uy quyen", "de xuat", "khe uoc"]),
    Rule("Hợp đồng", [], r_hop_dong, fname=["hop dong", "hd "]),
    Rule("Biên bản", ["bien ban"], r_bien_ban),
    Rule("Giấy ủy quyền", ["uy quyen"], r_guq),
    Rule("Giấy ủy quyền", [], r_guq, fname=["guq", "uy quyen"]),
    Rule("Quyết định", ["quyet dinh"], r_qd),
    Rule("Chứng chỉ NLXD", ["chung chi nang luc"], r_chung_chi),
    Rule("DS cổ đông", ["danh sach", "co dong"], r_ds_co_dong),
    Rule("Sổ cổ đông", ["so dang ky co dong"], r_so_co_dong),
    Rule("Điều lệ", ["dieu le"], r_dieu_le),
    Rule("Tờ trình", ["to trinh"], r_to_trinh),
    Rule("Công văn", ["cong van"], r_cong_van),
    Rule("Thông báo", ["thong bao"], r_thong_bao),
    Rule("Báo cáo", ["bao cao"], r_bao_cao),
    Rule("Khác", [], r_generic),
]
KY_HIEU = {"cv": "Công văn", "tb": "Thông báo", "ttr": "Tờ trình", "ttrinh": "Tờ trình", "qd": "Quyết định", "nq": "Nghị quyết", "bb": "Biên bản", "bbh": "Biên bản",
           "hd": "Hợp đồng", "hdtd": "Hợp đồng", "hdxd": "Hợp đồng", "hdtc": "Hợp đồng", "guq": "Giấy ủy quyền", "uq": "Giấy ủy quyền", "kunn": "Khế ước", "bc": "Báo cáo", "dx": "Đề xuất"}

def classify(text: str, name: str = "") -> Rule:
    tl, fn = title_norm(text), norm(name or "")
    best = None
    if tl:
        for idx, r in enumerate(RULES):
            if not r.keys or any(k in tl for k in r.not_keys):
                continue
            pos = [tl.find(k) for k in r.keys]
            if all(p >= 0 for p in pos):
                sc = (min(pos), idx)
                if best is None or sc < best[0]:
                    best = (sc, r)
    if best:
        return best[1]
    so = re.sub(r"[^a-z0-9\/\-]", "", norm(doc_number(text, name)))
    for k in (x.strip("/-") for x in re.findall(r"[\/\-]([a-z]{2,5})(?:[\/\-]|$)", so)):
        if k in KY_HIEU:
            return next(r for r in RULES if r.name == KY_HIEU[k])
    h = fuzzy(head_norm(text))
    for r in RULES:
        if any(k in h for k in r.not_keys):
            continue
        if r.fname:
            if any(k in fn for k in r.fname):
                return r
            continue
        if r.keys and all(k in h for k in r.keys):
            return r
    return RULES[-1]

def extract_fields(text: str, name: str = "", ctx=None) -> Fields:
    rule = classify(text, name)
    f = rule.fn(text, name, ctx)
    f.loai = rule.name
    f.noi_dung = sentence((f.noi_dung or "").strip())
    return f

# ------------------------------------------------------------------ 10. tách văn bản trong PDF gộp
START_KEYS = ["cong hoa xa hoi chu nghia viet nam", "socialist republic of vietnam", "giay chung nhan", "nghi quyet", "giay uy quyen", "quyet dinh", "can cuoc",
              "citizen identity", "danh sach", "phu luc", "dieu le", "chung chi", "so dang ky", "bien ban", "hop dong", "to trinh", "cong van", "thong bao", "de xuat", "bao cao", "de nghi", "khe uoc", "uy nhiem chi", "hoa don"]

def is_doc_start(text: str) -> bool:
    ls = lines_of(text)[:12]
    if not ls:
        return False
    h = norm(" ".join(ls))
    if re.search(r"\btrang\s*([2-9]|\d{2,})\s*\/\s*\d+", h) or re.search(r"\bpage\s*([2-9]|\d{2,})\b", h):
        return False
    for l in ls:
        if len(letters(l)) < 6 or upper_ratio(l) < 0.8:
            continue
        n = norm(clean_edge(l))
        if any(n.startswith(k) for k in START_KEYS):
            return True
    return False

def split_documents(pages: list[dict], mode: str) -> list[dict]:
    if not pages:
        return []
    if mode == "file":
        groups = [list(range(len(pages)))]
    elif mode == "page":
        groups = [[i] for i in range(len(pages))]
    else:
        groups = [[0]]
        for i in range(1, len(pages)):
            (groups.append([i]) if is_doc_start(pages[i]["text"]) else groups[-1].append(i))
    return [{"start": pages[g[0]]["page"], "end": pages[g[-1]]["page"], "text": "\n".join(pages[i]["text"] for i in g), "ocr": any(pages[i]["ocr"] for i in g)} for g in groups]

def looks_vietnamese(text: str) -> bool:
    n = " " + norm(text) + " "
    return sum(w in n for w in [" cong ", " ty ", " ngay ", " so ", " va ", " cua ", " hop ", " dong ", " theo ", " nam ", " thang ", " ban ", " viet nam", " quyet ", " bao ", " de "]) >= 3
