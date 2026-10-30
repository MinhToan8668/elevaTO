#!/usr/bin/env python3
"""Video Sorter — đọc ngày quay gốc, đổi tên chuẩn, xếp vào Năm/Tháng/Dự án,
phát hiện file trùng, tách Raw / Final.

  python video_sorter.py SRC... --project "Vlog Da Lat"       xem trước (không đụng file)
  python video_sorter.py SRC... --project "Vlog Da Lat" --apply   thực hiện
  python video_sorter.py --cards --apply                       lấy từ thẻ nhớ đang cắm (/Volumes/*/DCIM)
  python video_sorter.py --undo                                hoàn tác lần chạy gần nhất
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

import yaml
from rich.console import Console
from rich.progress import Progress
from rich.table import Table

HERE = Path(__file__).resolve().parent
LOG_DIR = HERE / "reports" / "sort_logs"
console = Console()

VIDEO = {"mp4", "mov", "m4v", "mkv", "avi", "mts", "m2ts", "insv", "360", "webm"}
PHOTO = {"jpg", "jpeg", "heic", "png", "dng", "arw", "cr2", "cr3", "nef", "raf", "orf", "rw2", "insp"}
AUDIO = {"wav", "mp3", "m4a", "aac"}
# File phụ đi kèm (DJI/GoPro/Sony): đi theo file chính
SIDECAR = {"srt", "lrf", "thm", "xml", "xmp", "aae"}
FINAL_PAT = re.compile(r"(final|export|render|xuat|ban[ _-]?cuoi|_out\b)", re.I)
MiB = 1024 * 1024

DEFAULTS = {
    "library": "~/Movies/Library",
    "name_template": "{date}_{project}_{seq:03d}",
    "move": True,          # True: di chuyển; False: copy (thẻ nhớ luôn copy)
    "include_photos": True,
    "include_audio": True,
}


def load_cfg() -> dict:
    cfg = dict(DEFAULTS)
    p = HERE / "config.yaml"
    if p.exists():
        cfg.update((yaml.safe_load(p.read_text(encoding="utf-8")) or {}).get("video_sorter", {}) or {})
    cfg["library"] = Path(os.path.expanduser(cfg["library"])).resolve()
    return cfg


def slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).replace("đ", "d").replace("Đ", "D")
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-") or "NoProject"


# ---------------------------------------------------------------- ngày quay
def _parse_dt(s: str) -> datetime | None:
    s = s.strip().replace("Z", "+00:00")
    for fmt in (None, "%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            dt = datetime.fromisoformat(s) if fmt is None else datetime.strptime(s[:19], fmt)
            if dt.tzinfo:  # đổi về giờ máy
                dt = dt.astimezone().replace(tzinfo=None)
            return dt if dt.year > 1995 else None
        except ValueError:
            continue
    return None


def shot_date(path: Path) -> tuple[datetime, str]:
    """Trả (thời điểm quay, nguồn). Ưu tiên metadata gốc, sau đó ngày tạo file."""
    ext = path.suffix.lower().lstrip(".")
    if shutil.which("ffprobe") and ext in VIDEO | AUDIO:
        r = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(path)],
                           capture_output=True, text=True)
        if r.returncode == 0:
            data = json.loads(r.stdout or "{}")
            tags = dict((data.get("format") or {}).get("tags") or {})
            for st in data.get("streams") or []:
                tags.update({k: v for k, v in (st.get("tags") or {}).items() if k not in tags})
            # iPhone ghi giờ địa phương ở key này, chính xác hơn creation_time (UTC)
            for key in ("com.apple.quicktime.creationdate", "creation_time", "date"):
                if key in tags and (dt := _parse_dt(tags[key])):
                    return dt, "metadata"
    if ext in PHOTO:
        dt = _exif_date(path)
        if dt:
            return dt, "exif"
    if shutil.which("mdls"):  # macOS Spotlight
        r = subprocess.run(["mdls", "-raw", "-name", "kMDItemContentCreationDate", str(path)], capture_output=True, text=True)
        if r.returncode == 0 and (dt := _parse_dt(r.stdout.replace(" +0000", "+00:00"))):
            return dt, "spotlight"
    st = path.stat()
    ts = getattr(st, "st_birthtime", None) or st.st_mtime
    return datetime.fromtimestamp(min(ts, st.st_mtime)), "file"


def _exif_date(path: Path) -> datetime | None:
    try:
        from PIL import Image
        with Image.open(path) as im:
            exif = im.getexif()
            raw = exif.get_ifd(0x8769).get(36867) or exif.get(306)  # DateTimeOriginal / DateTime
            return _parse_dt(raw) if raw else None
    except Exception:  # noqa: BLE001 — thiếu Pillow hoặc định dạng RAW không đọc được
        return None


# ---------------------------------------------------------------- trùng lặp
def quick_hash(path: Path) -> str:
    size = path.stat().st_size
    h = hashlib.sha1(str(size).encode())
    with open(path, "rb") as f:
        h.update(f.read(MiB))
        if size > 3 * MiB:
            f.seek(size // 2)
            h.update(f.read(MiB))
            f.seek(-MiB, os.SEEK_END)
            h.update(f.read(MiB))
    return h.hexdigest()


def library_index(lib: Path) -> dict[str, Path]:
    cache_p = lib / ".sorter_index.json"
    idx = {}
    if cache_p.exists():
        idx = {k: Path(v) for k, v in json.loads(cache_p.read_text()).items() if Path(v).exists()}
    return idx


def save_index(lib: Path, idx: dict[str, Path]) -> None:
    lib.mkdir(parents=True, exist_ok=True)
    (lib / ".sorter_index.json").write_text(json.dumps({k: str(v) for k, v in idx.items()}))


# ---------------------------------------------------------------- lập kế hoạch
def collect(sources: list[Path], cfg: dict) -> list[Path]:
    exts = set(VIDEO)
    if cfg["include_photos"]:
        exts |= PHOTO
    if cfg["include_audio"]:
        exts |= AUDIO
    files = []
    for src in sources:
        if src.is_file():
            files.append(src)
            continue
        for dp, dns, fns in os.walk(src):
            dns[:] = [d for d in dns if not d.startswith(".")]
            for n in fns:
                if not n.startswith(".") and Path(n).suffix.lower().lstrip(".") in exts:
                    files.append(Path(dp) / n)
    return sorted(files)


def card_sources() -> list[Path]:
    vols = Path("/Volumes")
    return [d for v in vols.iterdir() if v.is_dir() for d in (v / "DCIM", v / "PRIVATE") if d.exists()] if vols.exists() else []


def sidecars(path: Path) -> list[Path]:
    return [p for p in path.parent.glob(path.stem + ".*")
            if p != path and p.suffix.lower().lstrip(".") in SIDECAR]


def kind(path: Path) -> str:
    ext = path.suffix.lower().lstrip(".")
    return "Video" if ext in VIDEO else "Anh" if ext in PHOTO else "Audio"


def plan(files: list[Path], project: str, cfg: dict) -> list[dict]:
    lib, proj = cfg["library"], slug(project)
    idx = library_index(lib)
    rows, seen = [], {}
    seq: dict[str, int] = {}
    with Progress(console=console, transient=True) as pr:
        t = pr.add_task("Đọc ngày quay & kiểm tra trùng", total=len(files))
        dated = []
        for f in files:
            dt, source = shot_date(f)
            dated.append((dt, source, f))
            pr.advance(t)
    dated.sort(key=lambda x: (x[0], x[2].name))
    for dt, source, f in dated:
        h = quick_hash(f)
        day = dt.strftime("%Y-%m-%d")
        stage = "Final" if FINAL_PAT.search(f.stem) else "Raw"
        folder = lib / dt.strftime("%Y") / dt.strftime("%m") / f"{day}_{proj}" / stage / kind(f)
        if h in idx or h in seen:
            rows.append(dict(src=f, dst=None, date=dt, source=source, status="trùng",
                             dup_of=str(idx.get(h) or seen[h]), hash=h))
            continue
        key = f"{day}_{proj}"
        seq[key] = seq.get(key, _existing_seq(lib, key)) + 1
        name = cfg["name_template"].format(date=dt.strftime("%Y-%m-%d_%H%M%S"), day=day, project=proj,
                                           seq=seq[key], orig=f.stem, cam=_camera_hint(f))
        dst = folder / (name + f.suffix.lower())
        seen[h] = dst
        rows.append(dict(src=f, dst=dst, date=dt, source=source, status=stage, dup_of="", hash=h))
    return rows


def _existing_seq(lib: Path, key: str) -> int:
    nums = [int(m.group(1)) for p in lib.glob(f"*/*/{key}/**/*_{'[0-9]' * 3}.*")
            if (m := re.search(r"_(\d{3})$", p.stem))]
    return max(nums, default=0)


def _camera_hint(path: Path) -> str:
    n = path.name.upper()
    for pre, cam in (("DJI", "DJI"), ("GX", "GoPro"), ("GH", "GoPro"), ("IMG_", "iPhone"), ("C0", "Sony"), ("MVI", "Canon")):
        if n.startswith(pre):
            return cam
    return "Cam"


# ---------------------------------------------------------------- thực hiện
def is_on_card(p: Path) -> bool:
    return str(p).startswith("/Volumes/") and any(x in p.parts for x in ("DCIM", "PRIVATE"))


def apply(rows: list[dict], cfg: dict, dup_mode: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_p = LOG_DIR / f"sort_{datetime.now():%Y%m%d_%H%M%S}.csv"
    idx = library_index(cfg["library"])
    dup_dir = cfg["library"] / "_Trung_lap"
    with open(log_p, "w", newline="", encoding="utf-8") as lf, Progress(console=console) as pr:
        w = csv.writer(lf)
        w.writerow(["action", "src", "dst"])
        t = pr.add_task("Sắp xếp", total=len(rows))
        for r in rows:
            src: Path = r["src"]
            copy = is_on_card(src) or not cfg["move"]
            if r["status"] == "trùng":
                if dup_mode == "move" and not is_on_card(src):
                    dst = _unique(dup_dir / src.name)
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(src, dst)
                    w.writerow(["move", src, dst])
            else:
                dst = _unique(r["dst"])
                dst.parent.mkdir(parents=True, exist_ok=True)
                _transfer(src, dst, copy)
                w.writerow(["copy" if copy else "move", src, dst])
                idx[r["hash"]] = dst
                for sc in sidecars(src):
                    sdst = _unique(dst.with_suffix(sc.suffix.lower()))
                    _transfer(sc, sdst, copy)
                    w.writerow(["copy" if copy else "move", sc, sdst])
            lf.flush()
            pr.advance(t)
    save_index(cfg["library"], idx)
    return log_p


def _transfer(src: Path, dst: Path, copy: bool) -> None:
    if copy:
        shutil.copy2(src, dst)
        if dst.stat().st_size != src.stat().st_size or quick_hash(dst) != quick_hash(src):
            dst.unlink()
            raise IOError(f"Copy lỗi (không khớp): {src}")
    else:
        shutil.move(src, dst)


def _unique(p: Path) -> Path:
    i = 1
    out = p
    while out.exists():
        out = p.with_name(f"{p.stem}-{i}{p.suffix}")
        i += 1
    return out


def undo() -> None:
    logs = sorted(LOG_DIR.glob("sort_*.csv")) if LOG_DIR.exists() else []
    if not logs:
        console.print("Không có lần chạy nào để hoàn tác.")
        return
    log_p = logs[-1]
    with open(log_p, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    n = 0
    for r in reversed(rows):
        src, dst = Path(r["src"]), Path(r["dst"])
        if not dst.exists():
            continue
        if r["action"] == "copy":
            dst.unlink()
        else:
            src.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(dst, _unique(src))
        n += 1
    log_p.rename(log_p.with_suffix(".undone"))
    console.print(f"[green]Đã hoàn tác {n} file[/] từ {log_p.name}")


# ---------------------------------------------------------------- main
def main() -> None:
    ap = argparse.ArgumentParser(description="Sắp xếp video/ảnh theo ngày quay")
    ap.add_argument("sources", nargs="*", type=Path, help="folder hoặc file nguồn")
    ap.add_argument("-p", "--project", default="", help="tên dự án, vd 'Vlog Da Lat'")
    ap.add_argument("--cards", action="store_true", help="lấy từ thẻ nhớ đang cắm")
    ap.add_argument("--apply", action="store_true", help="thực hiện (mặc định chỉ xem trước)")
    ap.add_argument("--copy", action="store_true", help="copy thay vì di chuyển")
    ap.add_argument("--dups", choices=["skip", "move"], default="move",
                    help="file trùng: để nguyên (skip) hay gom vào _Trung_lap (move)")
    ap.add_argument("--undo", action="store_true", help="hoàn tác lần chạy gần nhất")
    args = ap.parse_args()

    if args.undo:
        return undo()
    cfg = load_cfg()
    if args.copy:
        cfg["move"] = False
    sources = [s.expanduser().resolve() for s in args.sources] + (card_sources() if args.cards else [])
    if not sources:
        ap.error("cần chỉ định folder nguồn hoặc --cards")
    if not shutil.which("ffprobe"):
        console.print("[yellow]Chưa có ffprobe → ngày quay video kém chính xác hơn. Cài: brew install ffmpeg[/]")

    files = collect(sources, cfg)
    if not files:
        console.print("Không tìm thấy video/ảnh nào.")
        return
    rows = plan(files, args.project, cfg)

    t = Table(title=f"Kế hoạch sắp xếp → {cfg['library']}")
    for c in ("File gốc", "Ngày quay", "Nguồn ngày", "→ Vị trí mới"):
        t.add_column(c, overflow="fold")
    for r in rows[:300]:
        dst = f"[red]TRÙNG với {r['dup_of']}[/]" if r["status"] == "trùng" else str(r["dst"].relative_to(cfg["library"]))
        src_style = "" if r["source"] in ("metadata", "exif") else "[yellow]"
        t.add_row(r["src"].name, r["date"].strftime("%d/%m/%Y %H:%M"), f"{src_style}{r['source']}", dst)
    console.print(t)
    dups = sum(r["status"] == "trùng" for r in rows)
    finals = sum(r["status"] == "Final" for r in rows)
    console.print(f"[bold]{len(rows)} file[/] · {dups} trùng · {finals} bản Final · "
                  f"{len(rows) - dups - finals} Raw. Ngày màu vàng = không có metadata, lấy theo ngày tạo file.")
    if not args.apply:
        console.print("\n[cyan]Đây là xem trước. Thêm --apply để thực hiện.[/]")
        return
    log_p = apply(rows, cfg, args.dups)
    console.print(f"[green]Xong![/] Nhật ký: {log_p} · Hoàn tác: python video_sorter.py --undo")


if __name__ == "__main__":
    sys.exit(main())
