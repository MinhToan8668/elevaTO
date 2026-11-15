#!/usr/bin/env python3
"""Disk Report — folder nào nặng nhất, file nào lâu không đụng, file nào trùng,
gợi ý file nên đẩy lên Telegram để dọn chỗ. Xuất trang HTML mở bằng trình duyệt.

  python disk_report.py ~/Movies ~/Downloads
  python disk_report.py ~ --min-big 500 --old-days 180
  python disk_report.py ~/Movies --queue      chuyển file gợi ý vào folder upload của TeleUploader
"""
from __future__ import annotations

import argparse
import hashlib
import html
import os
import shutil
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import yaml
from rich.console import Console
from rich.progress import Progress

HERE = Path(__file__).resolve().parent
console = Console()
MiB = 1024 * 1024
SKIP_DIRS = {"Library", ".Trash", "node_modules", ".git", ".venv", "Applications", "Photos Library.photoslibrary"}


def human(n: float) -> str:
    for u in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or u == "TB":
            return f"{n:.1f} {u}"
        n /= 1024
    return f"{n:.1f} TB"


def is_system_path(p) -> bool:
    """File của hệ thống / ứng dụng — chỉ để xem, không nên xoá bằng app."""
    parts = Path(p).parts
    return ("Library" in parts or "Applications" in parts or any(x.endswith((".app", ".photoslibrary")) for x in parts)
            or any(x.startswith(".") for x in parts[1:]))


def walk(roots: list[Path], full: bool = False, on_progress=None):
    """full=True: quét cả Library, ứng dụng, folder ẩn; chỉ giữ file ≥ 1MB trong danh sách (đỡ tốn RAM)
    nhưng dung lượng folder vẫn tính đủ. Tổng số file / dung lượng ở walk.count, walk.total."""
    files = []
    dir_size: dict[Path, int] = defaultdict(int)
    count = total = 0
    with Progress(console=console, transient=True) as pr:
        t = pr.add_task("Đang quét…", total=None)
        for root in roots:
            dev = os.stat(root).st_dev
            for dp, dns, fns in os.walk(root):
                if full:  # không đi sang ổ đĩa khác (ổ ngoài, ổ mạng)
                    dns[:] = [d for d in dns if _same_dev(os.path.join(dp, d), dev)]
                else:
                    dns[:] = [d for d in dns if not d.startswith(".") and d not in SKIP_DIRS
                              and not d.endswith((".app", ".photoslibrary"))]
                d = Path(dp)
                for n in fns:
                    p = d / n
                    try:
                        st = p.lstat()
                    except OSError:
                        continue
                    if not os.path.isfile(p) or os.path.islink(p):
                        continue
                    # dung lượng thật trên đĩa (file thưa / nén của macOS nhỏ hơn st_size)
                    size = min(st.st_size, st.st_blocks * 512) if full and getattr(st, "st_blocks", 0) else st.st_size
                    count += 1
                    total += size
                    if not full or size >= MiB:
                        files.append((p, size, st.st_mtime, st.st_atime))
                    # cộng dồn cho mọi folder cha trong phạm vi root
                    cur = d
                    while True:
                        dir_size[cur] += size
                        if cur == root or cur.parent == cur:
                            break
                        cur = cur.parent
                pr.update(t, description=f"Đã quét {count:,} file")
                if on_progress and count % 500 < len(fns) + 1:
                    on_progress(count, total)
    walk.count, walk.total = count, total
    return files, dir_size


# Nhóm quen thuộc khi quét toàn bộ máy: (tên, ghi chú, mức an toàn khi xoá, các mẫu đường dẫn tính từ thư mục cá nhân)
# an toàn: "safe" = xoá thoải mái · "care" = xoá được nhưng nên xem trước · "" = dữ liệu của bạn / hệ thống
KNOWN_GROUPS = [
    ("Thùng rác", "Chưa dọn — Finder → Empty Trash để lấy lại chỗ", "safe", [".Trash"]),
    ("Cache trình duyệt", "Xoá thoải mái, trình duyệt tự tạo lại",
     "safe", ["Library/Caches/BraveSoftware", "Library/Caches/Google", "Library/Caches/com.coccoc*", "Library/Caches/CocCoc",
              "Library/Caches/Firefox", "Library/Caches/Mozilla", "Library/Caches/com.apple.Safari",
              "Library/Caches/com.microsoft.edgemac", "Library/Caches/Microsoft Edge", "Library/Caches/com.operasoftware*",
              "Library/Caches/company.thebrowser.Browser", "Library/Application Support/*/*/Default/Service Worker/CacheStorage",
              "Library/Application Support/*/*/Default/Cache", "Library/Application Support/*/Default/Service Worker/CacheStorage"]),
    ("Telegram (cache media)", "Dọn trong Telegram → Settings → Data and Storage → Storage Usage",
     "care", ["Library/Group Containers/*.keepcoder.Telegram", "Library/Group Containers/*.ru.keepcoder.Telegram",
              "Library/Containers/ru.keepcoder.Telegram", "Library/Application Support/Telegram Desktop",
              "Library/Containers/org.telegram.desktop"]),
    ("CapCut (cache & bản nháp)", "Cache xoá được trong CapCut → Settings; bản nháp nên xem trước khi xoá",
     "care", ["Movies/CapCut", "Movies/CacheClip", "Movies/JianyingPro", "Library/Containers/com.lemon.lvoverseas",
              "Library/Application Support/CapCut", "Library/Caches/com.lemon.lvoverseas"]),
    ("Zalo", "Ảnh/file đã nhận — dọn trong Zalo → Cài đặt → Quản lý dữ liệu",
     "care", ["Library/Application Support/ZaloData", "Library/Application Support/ZaloPC", "Library/Containers/com.vng.zalo"]),
    ("Model AI & cache công cụ lập trình", "Xoá được, cần thì công cụ tự tải lại (tốn thời gian tải)",
     "safe", [".cache", ".npm", ".yarn", ".pnpm-store", ".cargo/registry", ".gradle/caches", ".m2/repository", ".ollama",
              ".lmstudio", "Library/Caches/pip", "Library/Caches/Homebrew", "Library/Caches/Yarn", "Library/Caches/pnpm",
              "Library/Caches/ms-playwright", "Library/Caches/CocoaPods", "Library/Caches/huggingface"]),
    ("Xcode & giả lập iPhone", "DerivedData và simulator cũ xoá được",
     "care", ["Library/Developer"]),
    ("Docker / máy ảo", "Xoá image & container thừa trong Docker Desktop",
     "care", ["Library/Containers/com.docker.docker", "Library/Group Containers/group.com.docker", ".docker", ".colima",
              "Library/Containers/com.utmapp.UTM", "Parallels", "Virtual Machines.localized"]),
    ("Microsoft Teams", "Cache xoá được", "safe", ["Library/Application Support/Microsoft/Teams",
                                                    "Library/Containers/com.microsoft.teams2", "Library/Group Containers/*.com.microsoft.teams"]),
    ("Thư viện Photos", "Ảnh/video của bạn trong app Photos", "", ["Pictures/*.photoslibrary"]),
    ("iCloud Drive (bản tải về máy)", "Chuột phải → Remove Download để chỉ giữ trên iCloud", "care", ["Library/Mobile Documents"]),
    ("Tin nhắn & Mail", "Tệp đính kèm iMessage / Mail", "", ["Library/Messages", "Library/Mail"]),
    ("Sao lưu iPhone", "Xoá bản cũ trong Finder → iPhone → Manage Backups", "care", ["Library/Application Support/MobileSync"]),
    ("Cache ứng dụng khác", "Xoá thoải mái, app tự tạo lại", "safe", ["Library/Caches"]),
]
CONTAINERS = {"Desktop", "Documents", "Downloads", "Movies", "Music", "Pictures", "Public"}
GiB = 1024 * MiB


def summarize(dir_size: dict, files, home: Path, apps: Path | None = None, min_size: int = 100 * MiB) -> list[dict]:
    """Bảng tổng hợp "cái gì đang chiếm chỗ": nhóm quen thuộc (cache, Telegram, CapCut…) + các thư mục dự án của bạn,
    xếp theo dung lượng, kèm bên trong gồm những gì."""
    kids: dict[Path, list] = defaultdict(list)
    for d, sz in dir_size.items():
        kids[d.parent].append((sz, d.name, d))
    for f, sz, *_ in files:
        if sz >= 50 * MiB:
            kids[f.parent].append((sz, f.name, f))

    claimed: set[Path] = set()

    def inside_claimed(d: Path) -> bool:
        return any(c == d or c in d.parents for c in claimed)

    def claimed_under(d: Path) -> int:
        # chỉ tính mục đã nhận ở tầng cao nhất, tránh trừ 2 lần (vd Library/Caches và Library/Caches/Brave)
        return sum(dir_size.get(c, 0) for c in claimed
                   if d in c.parents and not any(o in c.parents and d in o.parents for o in claimed))

    def short(n: int) -> str:
        return f"{n / GiB:.1f}G" if n >= GiB else f"{n / MiB:.0f}M"

    def contents(paths: list[Path], top: int = 5) -> str:
        if len(paths) > 1:
            rows = sorted(((dir_size.get(x, 0) - claimed_under(x), _nice(x, home)) for x in paths), reverse=True)
        else:
            d0 = paths[0]
            for _ in range(5):  # folder chỉ có 1 folder con đáng kể → nhìn sâu vào trong
                sub = [c for sz, _, c in kids.get(d0, []) if sz >= 20 * MiB]
                if len(sub) == 1 and sub[0] in dir_size:
                    d0 = sub[0]
                else:
                    break
            rows = sorted(((sz - (claimed_under(c) if c in dir_size else 0), nm) for sz, nm, c in kids.get(d0, [])
                           if not (c in dir_size and inside_claimed(c))), reverse=True)
        rows = [(sz, nm) for sz, nm in rows if sz >= 20 * MiB][:top]
        return ", ".join(f"{nm} {short(sz)}" for sz, nm in rows)

    out = []
    for label, note, safe, patterns in KNOWN_GROUPS:
        found = []
        for pat in patterns:
            for d in home.glob(pat):
                if d in dir_size and not inside_claimed(d) and d not in found:
                    found.append(d)
        found = [d for d in found if not any(o in d.parents for o in found)]
        size = sum(dir_size[d] - claimed_under(d) for d in found)
        if found and size >= min_size:
            out.append({"label": label, "note": note, "safe": safe, "size": size, "contents": contents(found),
                        "paths": [str(d) for d in sorted(found, key=lambda d: -dir_size[d])], "kind": "group"})
        claimed.update(found)

    def add_folder(d: Path, size: int, note: str = "", label: str | None = None):
        if size >= min_size:
            out.append({"label": label or _nice(d, home), "note": note, "safe": "", "size": size,
                        "contents": contents([d]), "paths": [str(d)], "kind": "folder"})

    def project(d: Path) -> Path:
        """Folder chỉ chứa gần như 1 folder con → đi sâu vào (vd Video Project → Video Project/video editor)."""
        for _ in range(4):
            sub = [(sz, c) for sz, _, c in kids.get(d, []) if c in dir_size]
            total = dir_size.get(d, 0)
            big = max(sub, default=(0, None))
            if big[1] is not None and total and big[0] >= 0.85 * total and not inside_claimed(big[1]):
                d = big[1]
            else:
                break
        return d

    for sz, name, d in sorted(kids.get(home, []), reverse=True):
        if d not in dir_size or inside_claimed(d) or name == "Library":
            continue
        if name in CONTAINERS:
            rest = sz - claimed_under(d)
            for csz, cname, c in sorted(kids.get(d, []), reverse=True):
                if c in dir_size and not inside_claimed(c) and csz - claimed_under(c) >= 500 * MiB:
                    pd = project(c)
                    add_folder(pd, dir_size[pd] - claimed_under(pd))
                    rest -= dir_size[pd] - claimed_under(pd)
                    claimed.add(pd)
            add_folder(d, rest, label=f"{name} (phần còn lại)")
        elif name.startswith("."):
            add_folder(d, sz - claimed_under(d), "Folder ẩn của một công cụ/ứng dụng — tìm hiểu trước khi xoá")
        else:
            pd = project(d)
            add_folder(pd, dir_size[pd] - claimed_under(pd))
            if pd != d:
                add_folder(d, sz - claimed_under(d) - (dir_size[pd] - claimed_under(pd)), label=f"{name} (phần còn lại)")
                claimed.add(pd)

    lib = home / "Library"
    if lib in dir_size:
        rest = dir_size[lib] - claimed_under(lib)
        if rest >= min_size:
            sup = lib / "Application Support"
            out.append({"label": "Dữ liệu ứng dụng khác (Library)", "note": "Dữ liệu các app đang dùng — gỡ app không dùng để giải phóng",
                        "safe": "", "size": rest, "contents": contents([sup if sup in dir_size else lib]),
                        "paths": [str(lib)], "kind": "group"})
    if apps and apps in dir_size and dir_size[apps] >= min_size:
        out.append({"label": "Ứng dụng đã cài", "note": "Gỡ app không dùng (kéo vào Thùng rác)", "safe": "",
                    "size": dir_size[apps], "contents": contents([apps]), "paths": [str(apps)], "kind": "group"})
    out.sort(key=lambda x: -x["size"])
    return out[:40]


def _nice(d: Path, home: Path) -> str:
    try:
        return str(d.relative_to(home))
    except ValueError:
        return str(d)


def _same_dev(path: str, dev: int) -> bool:
    try:
        return not os.path.islink(path) and os.lstat(path).st_dev == dev
    except OSError:
        return False


def find_dups(files, min_size: int):
    by_size = defaultdict(list)
    for p, s, *_ in files:
        if s >= min_size:
            by_size[s].append(p)
    cands = [ps for ps in by_size.values() if len(ps) > 1]
    groups = []
    with Progress(console=console, transient=True) as pr:
        t = pr.add_task("Kiểm tra file trùng", total=sum(map(len, cands)))
        for ps in cands:
            by_hash = defaultdict(list)
            for p in ps:
                try:
                    by_hash[_hash(p)].append(p)
                except OSError:
                    pass
                pr.advance(t)
            groups += [g for g in by_hash.values() if len(g) > 1]
    return groups


def _hash(p: Path) -> str:
    """Hash đầu/giữa/cuối — đủ chắc cho file media, nhanh hơn đọc cả file."""
    size = p.stat().st_size
    h = hashlib.sha1(str(size).encode())
    with open(p, "rb") as f:
        for off in (0, size // 2, max(0, size - MiB)):
            f.seek(off)
            h.update(f.read(MiB))
    return h.hexdigest()


def uploaded_paths() -> set[str]:
    db = HERE / "state.db"
    if not db.exists():
        return set()
    import sqlite3
    with sqlite3.connect(db) as c:
        return {r[0] for r in c.execute("SELECT path FROM uploads")}


def queue_folder() -> Path | None:
    p = HERE / "config.yaml"
    if not p.exists():
        return None
    folders = (yaml.safe_load(p.read_text(encoding="utf-8")) or {}).get("folders") or []
    return Path(os.path.expanduser(folders[0])).resolve() if folders else None


# ---------------------------------------------------------------- HTML
CSS = """
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1f;--mut:#6e6e73;--line:#e5e5ea;--acc:#0a84ff;--warn:#ff9f0a;--bad:#ff453a;--ok:#30d158}
@media (prefers-color-scheme:dark){:root{--bg:#111;--card:#1c1c1e;--fg:#f5f5f7;--mut:#98989d;--line:#2c2c2e}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,system-ui,sans-serif}
main{max-width:1100px;margin:auto;padding:24px 16px}h1{margin:0 0 4px}h2{margin:32px 0 10px;font-size:18px}
.mut{color:var(--mut)}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:18px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}.kpi b{display:block;font-size:22px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
td,th{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--mut);font-weight:500}
td.n{text-align:right;white-space:nowrap}.path{word-break:break-all}.bar{height:6px;background:var(--acc);border-radius:3px}
.tag{font-size:12px;padding:1px 7px;border-radius:9px;background:var(--line)}.tag.w{background:var(--warn);color:#000}.tag.ok{background:var(--ok);color:#000}
.wrap{overflow-x:auto}
"""


def esc(x) -> str:
    return html.escape(str(x))


def render(roots, files, dir_size, dups, args, uploaded) -> str:
    now = time.time()
    total = sum(s for _, s, *_ in files)
    big_min, old_s = args.min_big * MiB, args.old_days * 86400
    top_dirs = sorted(((d, s) for d, s in dir_size.items() if d not in roots), key=lambda x: -x[1])[:25]
    biggest = sorted(files, key=lambda f: -f[1])[:40]
    old = sorted((f for f in files if now - f[2] > old_s and f[1] >= 50 * MiB), key=lambda f: -f[1])[:40]
    suggest = suggestions(files, args)
    dup_waste = sum(g[0].stat().st_size * (len(g) - 1) for g in dups if g[0].exists())
    by_ext = defaultdict(int)
    for p, s, *_ in files:
        by_ext[p.suffix.lower() or "(không đuôi)"] += s
    exts = sorted(by_ext.items(), key=lambda x: -x[1])[:12]
    du = shutil.disk_usage(roots[0])

    def ftable(rows, show_age=True):
        out = ["<div class=wrap><table><tr><th>File</th><th class=n>Dung lượng</th><th class=n>Sửa lần cuối</th></tr>"]
        for p, s, m, _ in rows:
            tag = " <span class='tag ok'>đã up Telegram</span>" if str(p) in uploaded else ""
            age = f"{int((now - m) / 86400)} ngày trước" if show_age else ""
            out.append(f"<tr><td class=path>{esc(p)}{tag}</td><td class=n>{human(s)}</td><td class=n>{age}</td></tr>")
        return "".join(out) + "</table></div>"

    maxd = top_dirs[0][1] if top_dirs else 1
    parts = [f"<!doctype html><html lang=vi><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
             f"<title>Báo cáo ổ cứng</title><style>{CSS}</style><main>",
             f"<h1>Báo cáo ổ cứng</h1><div class=mut>{esc(', '.join(map(str, roots)))} · {datetime.now():%d/%m/%Y %H:%M}</div>",
             "<div class=kpis>",
             f"<div class=kpi><span class=mut>Ổ đĩa còn trống</span><b>{human(du.free)}</b><span class=mut>/ {human(du.total)}</span></div>",
             f"<div class=kpi><span class=mut>Đã quét</span><b>{human(total)}</b><span class=mut>{len(files):,} file</span></div>",
             f"<div class=kpi><span class=mut>File trùng lãng phí</span><b>{human(dup_waste)}</b><span class=mut>{len(dups)} nhóm</span></div>",
             f"<div class=kpi><span class=mut>Gợi ý đẩy lên Telegram</span><b>{human(sum(s for _, s, *_ in suggest))}</b>"
             f"<span class=mut>{len(suggest)} file</span></div></div>",
             "<h2>Folder nặng nhất</h2><div class=wrap><table><tr><th>Folder</th><th class=n>Dung lượng</th><th style='width:30%'></th></tr>"]
    for d, s in top_dirs:
        parts.append(f"<tr><td class=path>{esc(d)}</td><td class=n>{human(s)}</td>"
                     f"<td><div class=bar style='width:{max(2, s * 100 // maxd)}%'></div></td></tr>")
    parts.append("</table></div>")
    parts.append(f"<h2>💡 Nên đẩy lên Telegram rồi xoá khỏi máy</h2><p class=mut>File ≥ {args.min_big} MB "
                 f"và không sửa trong {args.old_days} ngày. Chạy lại với <code>--queue</code> để chuyển chúng vào folder upload.</p>")
    parts.append(ftable(suggest))
    parts.append("<h2>File trùng</h2>")
    if dups:
        parts.append("<div class=wrap><table><tr><th>Các bản giống nhau</th><th class=n>Mỗi bản</th></tr>")
        for g in sorted(dups, key=lambda g: -g[0].stat().st_size)[:60]:
            parts.append(f"<tr><td class=path>{'<br>'.join(esc(p) for p in g)}</td><td class=n>{human(g[0].stat().st_size)}</td></tr>")
        parts.append("</table></div>")
    else:
        parts.append("<p class=mut>Không có file trùng (≥ 10 MB).</p>")
    parts.append("<h2>File lớn nhất</h2>" + ftable(biggest))
    parts.append(f"<h2>Lâu không đụng tới (&gt; {args.old_days} ngày)</h2>" + ftable(old))
    parts.append("<h2>Theo loại file</h2><div class=wrap><table><tr><th>Đuôi</th><th class=n>Dung lượng</th></tr>")
    parts += [f"<tr><td>{esc(e)}</td><td class=n>{human(s)}</td></tr>" for e, s in exts]
    parts.append("</table></div></main></html>")
    return "".join(parts)


def suggestions(files, args):
    now = time.time()
    big_min, old_s = args.min_big * MiB, args.old_days * 86400
    return sorted((f for f in files if f[1] >= big_min and now - f[2] > old_s), key=lambda f: -f[1])[:200]


def queue_files(paths: list[Path], q: Path) -> int:
    """Chuyển file vào folder upload, giữ cây thư mục (tính từ home) để caption Telegram biết file từ đâu."""
    n = 0
    for p in paths:
        p = Path(p)
        if not p.exists():
            continue
        try:
            rel = p.relative_to(Path.home())
        except ValueError:
            rel = Path(*p.parts[1:])
        dst = q / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(p, dst)
        n += 1
    return n


def main() -> None:
    ap = argparse.ArgumentParser(description="Báo cáo dung lượng ổ cứng")
    ap.add_argument("roots", nargs="*", type=Path, default=[Path("~")])
    ap.add_argument("--min-big", type=int, default=300, help="MB, ngưỡng file lớn để gợi ý (mặc định 300)")
    ap.add_argument("--old-days", type=int, default=90, help="số ngày không sửa (mặc định 90)")
    ap.add_argument("--queue", action="store_true", help="chuyển file gợi ý vào folder upload của TeleUploader")
    ap.add_argument("--no-open", action="store_true")
    args = ap.parse_args()

    roots = [r.expanduser().resolve() for r in args.roots]
    files, dir_size = walk(roots)
    dups = find_dups(files, 10 * MiB)
    out_dir = HERE / "reports"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"disk_{datetime.now():%Y%m%d_%H%M%S}.html"
    out.write_text(render(roots, files, dir_size, dups, args, uploaded_paths()), encoding="utf-8")
    console.print(f"[green]Đã tạo báo cáo:[/] {out}")

    if args.queue:
        q = queue_folder()
        if not q:
            console.print("[red]config.yaml chưa có 'folders' cho TeleUploader.[/]")
            sys.exit(1)
        sugg = [f for f in suggestions(files, args) if not str(f[0]).startswith(str(q))]
        console.print(f"Sẽ chuyển {len(sugg)} file ({human(sum(f[1] for f in sugg))}) vào {q}")
        if sugg and input("Gõ 'yes' để xác nhận: ").strip().lower() == "yes":
            queue_files([p for p, *_ in sugg], q)
            console.print("[green]Đã chuyển.[/] TeleUploader sẽ up và đưa vào Thùng rác ở lượt kế tiếp.")
    if not args.no_open and sys.platform == "darwin":
        subprocess.run(["open", str(out)])


if __name__ == "__main__":
    main()
