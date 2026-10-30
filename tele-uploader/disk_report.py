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


def walk(roots: list[Path]):
    files = []
    dir_size: dict[Path, int] = defaultdict(int)
    with Progress(console=console, transient=True) as pr:
        t = pr.add_task("Đang quét…", total=None)
        for root in roots:
            for dp, dns, fns in os.walk(root):
                dns[:] = [d for d in dns if not d.startswith(".") and d not in SKIP_DIRS and not d.endswith((".app", ".photoslibrary"))]
                d = Path(dp)
                for n in fns:
                    p = d / n
                    try:
                        st = p.lstat()
                    except OSError:
                        continue
                    if not os.path.isfile(p) or os.path.islink(p):
                        continue
                    files.append((p, st.st_size, st.st_mtime, st.st_atime))
                    # cộng dồn cho mọi folder cha trong phạm vi root
                    cur = d
                    while True:
                        dir_size[cur] += st.st_size
                        if cur == root or cur.parent == cur:
                            break
                        cur = cur.parent
                pr.update(t, description=f"Đã quét {len(files):,} file")
    return files, dir_size


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
