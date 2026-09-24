# -*- coding: utf-8 -*-
"""
Rule-based: phân loại văn bản + trích trường (Số, Ngày, Tên, Nội dung)
từ text (OCR hoặc text layer) của giấy tờ pháp lý doanh nghiệp tiếng Việt.

Mọi so khớp từ khóa đều làm trên text KHÔNG DẤU, chữ thường (norm), nên OCR sai dấu
("CỎ PHẢN", "ĐIÊU LỆ", "ĐÀU TƯ", "bố sung") vẫn bắt được.
Thêm/sửa loại văn bản ở RULES cuối file.
"""
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from typing import Callable, Optional

# ----------------------------------------------------------------- tiện ích
def strip_accents(s: str) -> str:
    s = s.replace("Đ", "D").replace("đ", "d")
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

def norm(s: str) -> str:
    return re.sub(r"\s+", " ", strip_accents(s).lower()).strip()

def lines_of(t: str) -> list[str]:
    return [re.sub(r"\s+", " ", l).strip() for l in t.splitlines() if l.strip()]

def letters(s: str) -> list[str]:
    return [c for c in s if c.isalpha()]

def is_upper(s: str, ratio: float = 0.85) -> bool:
    ls = letters(s)
    return len(ls) >= 3 and sum(c.isupper() for c in ls) / len(ls) >= ratio

def cap(s: str) -> str:
    return s[:1].upper() + s[1:] if s else s

def vn_title(s: str) -> str:
    return " ".join(w[0] + w[1:].lower() if (w == w.upper() and w != w.lower()) else w for w in s.split(" ") if w)

def head_norm(text: str, n: int = 25) -> str:
    return norm(" ".join(lines_of(text)[:n]))

def title_lines(text: str, n: int = 15) -> list[str]:
    """Các dòng VIẾT HOA trong n dòng đầu (tiêu đề văn bản), bỏ dòng quốc hiệu."""
    out = []
    for l in lines_of(text)[:n]:
        if not is_upper(l):
            continue
        nl = norm(l)
        if any(k in nl for k in ("cong hoa xa hoi", "doc lap - tu do", "doc lap – tu do", "socialist republic")):
            continue
        out.append(l.strip("|:!;.-_ '`\"“”"))
    return out

# ------------------------------------------------------------ tên công ty
_LOAI = r"(co phan|tnhh(?: mot thanh vien| mtv| hai thanh vien tro len)?|hop danh)"
_STOP = (r"(?=$|[,;:(\"“”)]| thong qua| nhu sau| duoc | co | va | la | ngay | theo | tai | ve | ban hanh| kinh gui| cong hoa| doc lap"
         r"| ma so| dia chi| tru so| von dieu| dang ky| giay chung| so:| sau day| to chuc| hop| quyet dinh| nghi quyet| bien ban| dieu le|\.)")
_NAME_RE = re.compile(r"cong ty " + _LOAI + r" ([a-z0-9&.\- ]{3,80}?)" + _STOP)

def _loai_label(g: str) -> str:
    if g == "co phan":
        return "Cổ phần"
    if g == "hop danh":
        return "Hợp danh"
    return "TNHH" + {" mot thanh vien": " Một thành viên", " mtv": " MTV", " hai thanh vien tro len": " Hai thành viên trở lên"}.get(g[4:], "")

def company_name(text: str, limit: int = 6000) -> str:
    """
    Tìm mọi cụm 'CÔNG TY CỔ PHẦN/TNHH/HỢP DANH + TÊN' trong phần đầu văn bản (không dấu),
    lấy lại đúng đoạn có dấu tương ứng, rồi chọn tên xuất hiện nhiều nhất
    (ưu tiên bản viết thường trong thân văn bản vì OCR chữ hoa hay sai dấu).
    """
    ls = lines_of(text[:limit])
    cands = ls + [ls[i] + " " + ls[i + 1] for i in range(len(ls) - 1)]
    found: list[tuple[str, str, bool]] = []  # (key không dấu, tên có dấu, là bản viết hoa?)
    for l in cands:
        words_vn = l.split(" ")
        n = norm(l)
        words_nd = n.split(" ")
        for m in _NAME_RE.finditer(n):
            key = m.group(2).strip(" ,;(.")
            if len(key) < 3:
                continue
            seg = m.group(2).strip()
            upper = False
            if len(words_vn) == len(words_nd):  # map lại theo chỉ số từ
                start_w = len(n[: m.start(2)].split(" ")) - 1
                n_words = len(seg.split(" "))
                seg_vn = " ".join(words_vn[start_w : start_w + n_words]).strip(" ,;(.\"“”")
                upper = is_upper(seg_vn, 0.5)  # OCR chữ hoa hay lẫn thường
                seg = vn_title(seg_vn) if upper else seg_vn
            found.append((f"{m.group(1)}|{key}", seg, upper))
    if not found:
        return ""
    cnt = Counter(k for k, _, _ in found)
    best_key = max(cnt, key=lambda k: (cnt[k], len(k)))
    # trong các bản có cùng key, ưu tiên bản viết thường (từ thân văn bản), rồi bản dài nhất
    versions = [(u, s) for k, s, u in found if k == best_key]
    versions.sort(key=lambda v: (v[0], -len(v[1])))
    loai = _loai_label(best_key.split("|")[0])
    ten = re.sub(r"(?iu)\s+(Mã Số|Địa Chỉ|Số \d|Trụ Sở|Vốn Điều|Đăng Ký|Giấy Chứng|Cộng Hòa|Độc Lập).*$", "", versions[0][1])
    return f"Công ty {loai} {ten}".strip()

# ------------------------------------------------------------ ngày / số
@dataclass
class D:
    d: int; m: int; y: int
    def fmt(self) -> str:
        return f"{self.d:02d}/{self.m:02d}/{self.y}"

DATE_LONG = re.compile(r"ng[àa]y\s*(\d{1,2})\s*th[áa]ng\s*(\d{1,2})\s*n[ăa]m\s*(\d{4})", re.I)
DATE_SHORT = re.compile(r"(?<!\d)(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})(?!\d)")

def find_dates(text: str) -> list[D]:
    found = [(m.start(), m.group(1), m.group(2), m.group(3)) for m in DATE_LONG.finditer(text)]
    found += [(m.start(), m.group(1), m.group(2), m.group(3)) for m in DATE_SHORT.finditer(text)]
    found.sort()
    out = []
    for _, d, mo, y in found:
        d, mo, y = int(d), int(mo), int(y)
        if 1 <= d <= 31 and 1 <= mo <= 12 and 1990 <= y <= 2100:
            out.append(D(d, mo, y))
    return out

def first_date(text: str, after: Optional[str] = None) -> Optional[D]:
    if after:
        m = re.search(after, text, re.I)
        if m:
            ds = find_dates(text[m.end(): m.end() + 300])
            if ds:
                return ds[0]
    ds = find_dates(text)
    return ds[0] if ds else None

def header_date(text: str, n_lines: int = 12) -> Optional[D]:
    """Ngày ở phần đầu văn bản ('Tp. HCM, ngày 17 tháng 01 năm 2025'). Ngày viết tay OCR không đọc được -> None."""
    ls = lines_of(text)[:n_lines]
    for l in ls:
        if re.search(r"ng[àa]y", l, re.I):
            ds = find_dates(l)
            if ds:
                return ds[0]
    ds = find_dates(" ".join(ls))
    return ds[0] if ds else None

def date_from_filename(name: str) -> Optional[D]:
    """Tên file dạng '39._250117_PLS...' -> 17/01/2025 (YYMMDD), hoặc '20250117', hoặc '17.01.2025'."""
    for m in re.finditer(r"(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)", name):
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return D(d, mo, y)
    for m in re.finditer(r"(?<!\d)(\d{2})(\d{2})(\d{2})(?!\d)", name):
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31 and 0 <= y <= 40:
            return D(d, mo, 2000 + y)
    ds = find_dates(name)
    return ds[0] if ds else None

# "Số: 0Ÿ /2024/PLSĐĐL-ĐQM" -> "0/2024/PLSĐĐL-ĐQM" ; "Số: .04../2025/PLSĐĐL/ĐQM" -> "04/2025/PLSĐĐL/ĐQM"
NUM_RE = re.compile(r"S[ốoôỗộ]\s*[:.]?\s*([^\s\n]{0,6}?\s*(?:[\/\-.]\s*[A-Za-zÀ-ỹ0-9\-.]+){1,5})", re.U)

def doc_number(text: str) -> str:
    head = text[:1500]
    for m in NUM_RE.finditer(head):
        cand = re.sub(r"\s", "", m.group(1))
        if re.fullmatch(r"\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}", cand):
            continue  # bắt nhầm ngày
        if not re.search(r"[\/\-]", cand) or not re.search(r"(19|20)\d{2}|[A-Z]{2,}", cand):
            continue  # phải có năm hoặc ký hiệu viết tắt (NQ, QĐ, ...)
        cand = cand.strip(".,:;")
        if "/" in cand:  # phần số đầu viết tay OCR ra ký tự lạ -> chỉ giữ chữ số / chữ cái
            pre, rest = cand.split("/", 1)
            pre = re.sub(r"[^0-9A-Za-z]", "", pre) or "…"
            cand = pre + "/" + rest
        return cand
    m = re.search(r"S[ốo]\s*[:.]?\s*([A-Z]{2,5}-\d{5,})", head)
    return m.group(1) if m else ""

VV = [r"^V\/v\b", r"^V[ềe] vi[ệe]c\b", r"^V[ềe]\s*:"]

def line_after(text: str, patterns=VV, maxlen: int = 200) -> str:
    ls = lines_of(text)
    for i, l in enumerate(ls):
        for p in patterns:
            m = re.match(p, l, re.I)
            if m:
                rest = re.sub(r"^[\s:.\-–]+|[\s:.\-–]+$", "", l[m.end():])
                if not rest and i + 1 < len(ls):
                    rest = ls[i + 1]
                return rest[:maxlen]
    return ""

def von_dieu_le(text: str) -> str:
    """'Vốn điều lệ của Công ty là: 14.520.000.000.000 (bằng chữ...' -> 'Vốn điều lệ 14.520.000.000.000 đồng'."""
    m = re.search(r"v[ốoôỗ]n [đd]i[ềeêể]u l[ệeêệ][^\d]{0,60}((?:\d{1,3}\.)+\d{3}|\d[\d.,]*)\s*(t[ỷy]|tri[ệe]u|đ[ồo]ng|VN[ĐD])?", text, re.I)
    if not m or len(re.sub(r"\D", "", m.group(1))) < 4:
        return ""
    dv = m.group(2) or "đồng"
    s = f"Vốn điều lệ {m.group(1).rstrip('.,')} {dv} đồng"
    return s.replace("đồng đồng", "đồng").replace("VNĐ đồng", "đồng").replace("VND đồng", "đồng")

def sua_doi_dieu(text: str) -> str:
    """'Sửa đổi Khoản 4 Điều 2 Điều lệ' -> 'Sửa đổi khoản 4 Điều 2'."""
    m = re.search(r"sua doi(,? bo sung)? (khoan [\d.]+ )?(dieu \d+)", norm(text[:4000]))
    if not m:
        return ""
    return ("Sửa đổi" + (", bổ sung" if m.group(1) else "") + " " + (m.group(2) or "") + m.group(3)).replace("dieu", "Điều").replace("khoan", "khoản")

def find_title_line(text: str, keys: list[str], look: int = 15) -> str:
    ls = lines_of(text)
    for i in range(min(look, len(ls))):
        if all(k in norm(ls[i]) for k in keys):
            title = ls[i]
            for nx in ls[i + 1 : i + 3]:
                if is_upper(nx) and not norm(nx).startswith(("can cu", "so:", "cong hoa", "doc lap")):
                    title += " " + nx
                else:
                    break
            return title
    return ""

# ----------------------------------------------------------------- kết quả
@dataclass
class Fields:
    so: str = ""
    ngay: Optional[D] = None
    ten: str = ""
    noi_dung: str = ""
    loai: str = ""

# ------------------------------------------------------------ rule từng loại
def r_gcn(text):
    m = re.search(r"[Đđ]ăng ký thay đổi lần thứ\s*:?\s*(\d+)", text, re.I)
    lan = m.group(1) if m else ""
    ngay = first_date(text, r"[Đđ]ăng ký thay đổi lần thứ\s*:?\s*\d+") if lan else first_date(text)
    hn = head_norm(text)
    loai = "Công ty Cổ phần" if "cong ty co phan" in hn else "Công ty TNHH" if "cong ty tnhh" in hn else ""
    return Fields("", ngay, f"Giấy chứng nhận đăng ký doanh nghiệp {loai}".strip(),
                  f"Đăng ký thay đổi lần thứ {lan}" if lan else "Đăng ký lần đầu")

def r_cccd(text):
    name = ""
    ls = lines_of(text)
    for i, l in enumerate(ls):
        if re.search(r"h[ọo] v[àa] t[êe]n|full name", l, re.I):
            rest = re.sub(r"(?i).*?(h[ọo] v[àa] t[êe]n|full name)\s*[:\/]*\s*", "", l)
            rest = re.sub(r"(?i)^\/?\s*Full name\s*:?\s*", "", rest).strip()
            if not rest and i + 1 < len(ls):
                rest = ls[i + 1]
            name = vn_title(rest)
            break
    m = re.search(r"(?<!\d)(\d{12})(?!\d)", text)
    return Fields("", None, f"CCCD {name}".strip(), f"Số {m.group(1)}" if m else "")

def r_nq(co_quan: str):
    def f(text):
        ten = re.sub(r"\s+", " ", f"Nghị quyết {co_quan} {company_name(text)}").strip()
        return Fields(doc_number(text), header_date(text), ten, line_after(text))
    return f

def r_guq(text):
    return Fields(doc_number(text), header_date(text), "Giấy ủy quyền", line_after(text))

def r_qd(text):
    nd, ten = line_after(text), "Quyết định"
    if "bo nhiem" in head_norm(text):
        ten = "Quyết định bổ nhiệm"
        if not nd:
            m = re.search(r"[Bb]ổ nhiệm\s+(?:ông|bà|Ông|Bà)?\s*([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s[A-ZÀ-Ỹ][a-zà-ỹ]+){1,4})", text)
            if m:
                nd = f"Bổ nhiệm {m.group(1)}"
    return Fields(doc_number(text), header_date(text), ten, nd)

def r_chung_chi(text):
    return Fields(doc_number(text), header_date(text), "Chứng chỉ năng lực hoạt động xây dựng", "")

def r_pl_dieu_le(text):
    """Phụ lục sửa đổi điều lệ: nội dung = điều khoản sửa + vốn điều lệ / người ĐDPL (nếu có)."""
    parts = [sua_doi_dieu(text)]
    v = von_dieu_le(text)
    if v:
        parts.append(v)
    elif re.search(r"nguoi dai dien theo phap luat", norm(text[:3000])):
        parts.append("Thay đổi người đại diện theo pháp luật")
    nd = " – ".join(p for p in parts if p) or line_after(text)
    return Fields(doc_number(text), header_date(text), f"Phụ lục sửa đổi Điều lệ {company_name(text)}".strip(), nd)

def r_dieu_le(text):
    n = norm(text[:6000])
    m = re.search(r"sua doi,? bo sung lan thu (\d+)", n)
    nd = f"Sửa đổi, bổ sung lần thứ {m.group(1)}" if m else ""
    hl = re.search(r"c[óo] hi[ệeê]u l[ựu]c (?:k[ểe] )?t[ừu] ng[àa]y\s*([\d\/\-.]+)", text, re.I)
    ngay = (find_dates(hl.group(0)) or [None])[0] if hl else None
    if ngay and not nd:
        nd = f"Có hiệu lực từ ngày {ngay.fmt()}"
    return Fields("", ngay or first_date(text), f"Điều lệ {company_name(text)}".strip(), nd)

def r_ds_co_dong(text):
    title = find_title_line(text, ["danh sach", "co dong"])
    if is_upper(title):
        title = cap(title.lower())
    m = re.search(r"ch[ốo]t\s*(?:đ[ếe]n\s*)?ng[àa]y\s*([\d\/\-.]+)", text, re.I)
    ngay = (find_dates(m.group(0)) or [None])[0] if m else None
    return Fields("", ngay or header_date(text), title or "Danh sách cổ đông", von_dieu_le(text))

def r_so_co_dong(text):
    return Fields("", header_date(text), "Sổ đăng ký cổ đông", "")

def r_bien_ban(text):
    hn = head_norm(text)
    kind = ("Đại hội đồng cổ đông" if "dai hoi dong co dong" in hn else
            "Hội đồng quản trị" if "hoi dong quan tri" in hn else
            "Hội đồng thành viên" if "hoi dong thanh vien" in hn else "")
    ten = re.sub(r"\s+", " ", f"Biên bản họp {kind} {company_name(text)}").strip()
    return Fields(doc_number(text), header_date(text), ten, line_after(text))

def r_hop_dong(text):
    title = next((l for l in lines_of(text)[:15] if "hop dong" in norm(l)), "Hợp đồng")
    if is_upper(title):
        title = cap(title.lower())
    return Fields(doc_number(text), header_date(text), title, line_after(text))

def r_generic(text):
    tl = title_lines(text)
    title = cap(" ".join(tl[:2]).lower()) if tl else ""
    return Fields(doc_number(text), header_date(text), title, line_after(text))

@dataclass
class Rule:
    name: str
    keys: list[str]            # từ khóa KHÔNG DẤU, chữ thường, phải cùng có mặt
    fn: Callable[[str], Fields]
    not_keys: list[str] = field(default_factory=list)

# Bước 1: khớp trên các DÒNG VIẾT HOA đầu văn bản (tiêu đề) – rule có từ khóa xuất hiện sớm nhất thắng,
#         bằng nhau thì rule đứng trước thắng.
# Bước 2: không có -> khớp "chứa tất cả từ khóa" trong ~25 dòng đầu, theo thứ tự rule.
RULES = [
    Rule("GCN ĐKDN",        ["giay chung nhan dang ky doanh nghiep"], r_gcn),
    Rule("GCN ĐKDN",        ["giay chung nhan", "dang ky doanh nghiep"], r_gcn),
    Rule("CCCD",            ["can cuoc"], r_cccd),
    Rule("CCCD",            ["citizen identity"], r_cccd),
    Rule("Phụ lục điều lệ", ["phu luc", "dieu le"], r_pl_dieu_le),
    Rule("NQ ĐHĐCĐ",        ["nghi quyet", "dai hoi dong co dong"], r_nq("Đại hội đồng cổ đông")),
    Rule("NQ HĐQT",         ["nghi quyet", "hoi dong quan tri"], r_nq("Hội đồng quản trị")),
    Rule("NQ HĐTV",         ["nghi quyet", "hoi dong thanh vien"], r_nq("Hội đồng thành viên")),
    Rule("Nghị quyết",      ["nghi quyet"], r_nq("")),
    Rule("Biên bản",        ["bien ban"], r_bien_ban),
    Rule("Giấy ủy quyền",   ["giay uy quyen"], r_guq),
    Rule("Giấy ủy quyền",   ["uy quyen"], r_guq, ["hop dong"]),
    Rule("Quyết định",      ["quyet dinh"], r_qd),
    Rule("Chứng chỉ NLXD",  ["chung chi nang luc"], r_chung_chi),
    Rule("DS cổ đông",      ["danh sach", "co dong"], r_ds_co_dong),
    Rule("Sổ cổ đông",      ["so dang ky co dong"], r_so_co_dong),
    Rule("Điều lệ",         ["dieu le"], r_dieu_le),
    Rule("Hợp đồng",        ["hop dong"], r_hop_dong),
    Rule("Khác",            [], r_generic),
]

def classify(text: str) -> Rule:
    tl = norm(" ".join(title_lines(text)))
    best = None
    for idx, r in enumerate(RULES[:-1]):
        if not tl or any(k in tl for k in r.not_keys):
            continue
        pos = [tl.find(k) for k in r.keys]
        if all(p >= 0 for p in pos):
            score = (min(pos), idx)
            if best is None or score < best[0]:
                best = (score, r)
    if best:
        return best[1]
    h = head_norm(text)
    return next((r for r in RULES if all(k in h for k in r.keys) and not any(k in h for k in r.not_keys)), RULES[-1])

def extract_fields(text: str) -> Fields:
    rule = classify(text)
    f = rule.fn(text)
    f.loai = rule.name
    return f

# ------------------------------------------------- tách văn bản trong PDF gộp
START_KEYS = ["cong hoa xa hoi chu nghia viet nam", "socialist republic of vietnam", "giay chung nhan", "nghi quyet",
              "giay uy quyen", "quyet dinh", "can cuoc", "citizen identity", "danh sach", "phu luc", "dieu le",
              "chung chi", "so dang ky", "bien ban", "hop dong", "ownership chart", "to trinh", "cong van", "thong bao"]

def is_doc_start(text: str) -> bool:
    ls = lines_of(text)[:12]
    if not ls:
        return False
    h = norm(" ".join(ls))
    if re.search(r"\btrang\s*([2-9]|\d{2,})\s*\/\s*\d+", h) or re.search(r"\bpage\s*([2-9]|\d{2,})\b", h):
        return False
    for l in ls:
        if not is_upper(l, 0.8) or len(letters(l)) < 6:
            continue
        n = norm(l).lstrip("|:!;.-_'`\"“” ")  # OCR hay dính ký tự rác đầu dòng
        if any(n.startswith(k) for k in START_KEYS):
            return True
    return False

def split_documents(pages: list[dict], mode: str) -> list[dict]:
    """pages: [{page, text, ocr}] -> [{start, end, text, ocr}]"""
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
    return [{
        "start": pages[g[0]]["page"], "end": pages[g[-1]]["page"],
        "text": "\n".join(pages[i]["text"] for i in g),
        "ocr": any(pages[i]["ocr"] for i in g),
    } for g in groups]
