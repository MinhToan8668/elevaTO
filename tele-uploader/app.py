#!/usr/bin/env python3
"""TeleUploader — quét folder trên Mac, thống kê, upload lên Telegram có tổ chức,
tự split file lớn, upload xong thì chuyển file gốc vào Thùng rác.

Lệnh:
  python app.py login            đăng nhập Telegram (lần đầu)
  python app.py scan             thống kê folder, không upload
  python app.py upload [--dry-run]  upload 1 lượt
  python app.py watch            chạy liên tục, tự quét lại theo chu kỳ
  python app.py history          xem các file đã upload
  python app.py find "từ khoá"    tìm file trên Telegram (tên, folder, #hashtag)
  python app.py get <ID|tên>     tải về, tự ghép nếu file đã bị split
"""
from __future__ import annotations

import argparse
import asyncio
import fnmatch
import hashlib
import os
import platform
import re
import shutil
import sqlite3
import subprocess
import sys
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import yaml
from rich.console import Console
from rich.progress import (BarColumn, DownloadColumn, Progress, TextColumn,
                           TimeRemainingColumn, TransferSpeedColumn)
from rich.table import Table

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.yaml"
DB_PATH = HERE / "state.db"
SPLIT_DIR = HERE / "_split_tmp"
SESSION = str(HERE / "teleuploader")

MiB = 1024 * 1024
# Giới hạn Telegram: 2000 MiB (thường), 4000 MiB (Premium). Chừa dư cho an toàn.
LIMIT_NORMAL = 1950 * MiB
LIMIT_PREMIUM = 3900 * MiB
CAPTION_MAX = 1024

console = Console()

CATEGORIES = {
    "video": {"mp4", "mov", "mkv", "avi", "m4v", "webm", "flv", "wmv", "ts"},
    "anh": {"jpg", "jpeg", "png", "heic", "gif", "webp", "raw", "cr2", "nef", "arw", "dng", "tiff", "bmp"},
    "nhac": {"mp3", "m4a", "wav", "flac", "aac", "ogg", "aiff"},
    "tailieu": {"pdf", "doc", "docx", "xls", "xlsx", "csv", "ppt", "pptx", "txt", "md", "pages", "numbers", "key", "epub"},
    "nen": {"zip", "rar", "7z", "tar", "gz", "bz2", "xz", "dmg", "iso", "pkg"},
    "code": {"py", "js", "ts", "html", "css", "json", "swift", "java", "c", "cpp", "go", "rs", "sql"},
}


def category_of(path: Path) -> str:
    ext = path.suffix.lower().lstrip(".")
    for cat, exts in CATEGORIES.items():
        if ext in exts:
            return cat
    return "khac"


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024
    return f"{n:.1f} TB"


def hashtag(text: str) -> str:
    tag = re.sub(r"[^\w]+", "_", text, flags=re.UNICODE).strip("_")
    return f"#{tag}" if tag else ""


# ---------------------------------------------------------------- config / db
def load_config() -> dict:
    if not CONFIG_PATH.exists():
        console.print(f"[red]Chưa có {CONFIG_PATH.name}.[/] Copy config.example.yaml thành config.yaml rồi điền api_id/api_hash.")
        sys.exit(1)
    cfg = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
    cfg.setdefault("target", "me")
    cfg.setdefault("premium", False)
    cfg.setdefault("move_to_trash", True)
    cfg.setdefault("min_file_age_seconds", 120)
    cfg.setdefault("ignore", [".*"])
    cfg.setdefault("send_as_document", True)
    cfg.setdefault("concurrency", 2)
    cfg.setdefault("watch_interval_seconds", 300)
    cfg["folders"] = [Path(os.path.expanduser(f)).resolve() for f in cfg.get("folders", [])]
    if not cfg["folders"]:
        console.print("[red]config.yaml chưa khai báo 'folders'.[/]")
        sys.exit(1)
    return cfg


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""CREATE TABLE IF NOT EXISTS uploads(
        fingerprint TEXT PRIMARY KEY, path TEXT, root TEXT, rel TEXT, size INTEGER,
        parts INTEGER, message_ids TEXT, chat TEXT, uploaded_at TEXT, trashed INTEGER DEFAULT 0)""")
    return conn


def fingerprint(path: Path, size: int) -> str:
    """Nhận diện file theo tên + size + hash 1MB đầu/cuối (nhanh, không đọc cả file)."""
    h = hashlib.sha1(f"{path.name}|{size}".encode())
    with open(path, "rb") as f:
        h.update(f.read(MiB))
        if size > 2 * MiB:
            f.seek(-MiB, os.SEEK_END)
            h.update(f.read(MiB))
    return h.hexdigest()


# ---------------------------------------------------------------- scanning
@dataclass
class Item:
    path: Path
    root: Path
    size: int
    mtime: float

    @property
    def rel(self) -> Path:
        return self.path.relative_to(self.root)

    @property
    def folder_parts(self) -> list[str]:
        return [self.root.name, *self.rel.parent.parts]


def is_ignored(name: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatch(name, p) for p in patterns)


def scan(cfg: dict) -> tuple[list[Item], list[Item]]:
    """Trả về (file sẵn sàng, file đang bị bỏ qua vì mới sửa)."""
    ready, fresh = [], []
    now = time.time()
    for root in cfg["folders"]:
        if not root.exists():
            console.print(f"[yellow]Không thấy folder:[/] {root}")
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = sorted(d for d in dirnames if not is_ignored(d, cfg["ignore"]))
            for name in sorted(filenames):
                if is_ignored(name, cfg["ignore"]):
                    continue
                p = Path(dirpath) / name
                try:
                    st = p.stat()
                except OSError:
                    continue
                if st.st_size == 0:
                    continue
                item = Item(p, root, st.st_size, st.st_mtime)
                (fresh if now - st.st_mtime < cfg["min_file_age_seconds"] else ready).append(item)
    return ready, fresh


def print_stats(items: list[Item], fresh: list[Item], limit: int) -> None:
    by_folder: dict[str, list[Item]] = defaultdict(list)
    by_cat: dict[str, list[Item]] = defaultdict(list)
    for it in items:
        by_folder["/".join(it.folder_parts)].append(it)
        by_cat[category_of(it.path)].append(it)

    t = Table(title="Thống kê theo folder", show_lines=False)
    t.add_column("Folder")
    t.add_column("Số file", justify="right")
    t.add_column("Dung lượng", justify="right")
    t.add_column("Cần split", justify="right")
    for folder, its in sorted(by_folder.items()):
        big = sum(1 for i in its if i.size > limit)
        t.add_row(folder, str(len(its)), human(sum(i.size for i in its)), str(big) if big else "-")
    console.print(t)

    c = Table(title="Thống kê theo loại")
    c.add_column("Loại")
    c.add_column("Số file", justify="right")
    c.add_column("Dung lượng", justify="right")
    for cat, its in sorted(by_cat.items(), key=lambda kv: -sum(i.size for i in kv[1])):
        c.add_row(cat, str(len(its)), human(sum(i.size for i in its)))
    console.print(c)

    total = sum(i.size for i in items)
    big = [i for i in items if i.size > limit]
    console.print(f"[bold]Tổng:[/] {len(items)} file, {human(total)}. "
                  f"File > {human(limit)} sẽ split: {len(big)}.")
    if fresh:
        console.print(f"[yellow]{len(fresh)} file vừa được sửa gần đây, tạm bỏ qua (có thể đang copy dở).[/]")


def save_report(items: list[Item]) -> Path:
    out = HERE / "reports"
    out.mkdir(exist_ok=True)
    path = out / f"scan_{datetime.now():%Y%m%d_%H%M%S}.csv"
    with open(path, "w", encoding="utf-8-sig") as f:
        f.write("folder,file,loai,size_bytes,size,modified\n")
        for it in items:
            row = ["/".join(it.folder_parts), it.path.name, category_of(it.path), str(it.size),
                   human(it.size), datetime.fromtimestamp(it.mtime).strftime("%Y-%m-%d %H:%M")]
            f.write(",".join('"' + v.replace('"', '""') + '"' for v in row) + "\n")
    return path


# ---------------------------------------------------------------- caption / split
def build_caption(it: Item, part: int = 0, total_parts: int = 1) -> str:
    folder = " / ".join(it.folder_parts)
    tags = " ".join(filter(None, [*(hashtag(p) for p in it.folder_parts), f"#{category_of(it.path)}"]))
    lines = [f"📁 {folder}", f"📄 {it.path.name}"]
    meta = f"💾 {human(it.size)} · 🗓 {datetime.fromtimestamp(it.mtime):%d/%m/%Y}"
    if total_parts > 1:
        meta += f" · 🧩 phần {part}/{total_parts}"
    lines.append(meta)
    if total_parts > 1 and part == total_parts:
        lines.append(f"Ghép lại trên Mac: cat \"{it.path.name}\".part* > \"{it.path.name}\"")
    lines.append(tags)
    cap = "\n".join(lines)
    return cap if len(cap) <= CAPTION_MAX else cap[:CAPTION_MAX - 1] + "…"


def split_file(it: Item, limit: int) -> list[Path]:
    """Cắt file thành các phần .part001, .part002... (ghép bằng `cat`)."""
    n_parts = -(-it.size // limit)
    workdir = SPLIT_DIR / hashlib.sha1(str(it.path).encode()).hexdigest()[:12]
    workdir.mkdir(parents=True, exist_ok=True)
    free = shutil.disk_usage(workdir).free
    if free < it.size + 512 * MiB:
        raise RuntimeError(f"Không đủ dung lượng trống để split ({human(free)} < {human(it.size)})")
    parts = []
    buf = 8 * MiB
    with open(it.path, "rb") as src:
        for i in range(1, n_parts + 1):
            part = workdir / f"{it.path.name}.part{i:03d}"
            expected = min(limit, it.size - (i - 1) * limit)
            if part.exists() and part.stat().st_size == expected:  # đã cắt từ lần chạy trước
                src.seek(expected, os.SEEK_CUR)
            else:
                with open(part, "wb") as dst:
                    left = expected
                    while left:
                        chunk = src.read(min(buf, left))
                        if not chunk:
                            raise IOError("File bị thay đổi trong lúc split")
                        dst.write(chunk)
                        left -= len(chunk)
            parts.append(part)
    return parts


# ---------------------------------------------------------------- trash
def move_to_trash(path: Path) -> None:
    if platform.system() == "Darwin":
        # Dùng Finder để file vào Thùng rác đúng chuẩn, có thể "Put Back".
        script = f'tell application "Finder" to delete (POSIX file "{path.as_posix().replace(chr(34), chr(92) + chr(34))}")'
        r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
        if r.returncode == 0:
            return
    from send2trash import send2trash
    send2trash(str(path))


def cleanup_empty_dirs(root: Path) -> None:
    for dirpath, _, _ in sorted(os.walk(root), key=lambda x: -len(x[0])):
        d = Path(dirpath)
        if d == root:
            continue
        leftovers = [p for p in d.iterdir() if p.name != ".DS_Store"]
        if not leftovers:
            try:
                (d / ".DS_Store").unlink(missing_ok=True)
                d.rmdir()
            except OSError:
                pass


# ---------------------------------------------------------------- telegram
async def get_client(cfg: dict):
    from telethon import TelegramClient
    client = TelegramClient(SESSION, int(cfg["api_id"]), cfg["api_hash"],
                            device_model="TeleUploader Mac", connection_retries=10, retry_delay=5)
    await client.start()
    return client


async def resolve_target(client, target):
    if isinstance(target, str) and re.fullmatch(r"-?\d+", target):
        target = int(target)
    return await client.get_entity(target)


async def send_with_retry(client, entity, file: Path, caption: str, cfg: dict, progress, task):
    from telethon.errors import FloodWaitError
    for attempt in range(1, 6):
        try:
            def cb(sent, total):
                progress.update(task, completed=sent, total=total)
            return await client.send_file(entity, str(file), caption=caption, force_document=cfg["send_as_document"],
                                          progress_callback=cb, part_size_kb=512, supports_streaming=True)
        except FloodWaitError as e:
            console.print(f"[yellow]Telegram yêu cầu chờ {e.seconds}s…[/]")
            await asyncio.sleep(e.seconds + 2)
        except (ConnectionError, OSError, asyncio.TimeoutError) as e:
            wait = 10 * attempt
            console.print(f"[yellow]Lỗi mạng ({e}); thử lại sau {wait}s (lần {attempt}/5)[/]")
            await asyncio.sleep(wait)
    raise RuntimeError(f"Upload thất bại sau nhiều lần thử: {file.name}")


async def upload_one(client, entity, it: Item, cfg: dict, limit: int, conn, progress, sem, results):
    async with sem:
        try:
            fp = await asyncio.to_thread(fingerprint, it.path, it.size)
        except OSError as e:
            results["failed"].append((it, str(e)))
            return
        row = conn.execute("SELECT message_ids FROM uploads WHERE fingerprint=?", (fp,)).fetchone()
        if row:
            console.print(f"[dim]Đã up trước đó, bỏ qua upload: {it.rel}[/]")
            if cfg["move_to_trash"]:
                await asyncio.to_thread(move_to_trash, it.path)
            results["skipped"].append(it)
            return

        task = progress.add_task(str(it.rel)[:50], total=it.size)
        try:
            files = [it.path]
            if it.size > limit:
                progress.update(task, description=f"✂️ split {it.path.name[:40]}")
                files = await asyncio.to_thread(split_file, it, limit)
            msg_ids = []
            for i, f in enumerate(files, 1):
                progress.update(task, description=f"{it.path.name[:40]} ({i}/{len(files)})", completed=0)
                msg = await send_with_retry(client, entity, f, build_caption(it, i, len(files)), cfg, progress, task)
                msg_ids.append(msg.id)
            conn.execute("INSERT OR REPLACE INTO uploads VALUES(?,?,?,?,?,?,?,?,?,0)",
                         (fp, str(it.path), str(it.root), str(it.rel), it.size, len(files),
                          ",".join(map(str, msg_ids)), str(cfg["target"]), datetime.now().isoformat(timespec="seconds")))
            conn.commit()
            if len(files) > 1:
                shutil.rmtree(files[0].parent, ignore_errors=True)
            if cfg["move_to_trash"]:
                await asyncio.to_thread(move_to_trash, it.path)
                conn.execute("UPDATE uploads SET trashed=1 WHERE fingerprint=?", (fp,))
                conn.commit()
            results["done"].append((it, msg_ids))
        except Exception as e:  # noqa: BLE001 — ghi lại lỗi, tiếp tục file khác
            results["failed"].append((it, str(e)))
            console.print(f"[red]Lỗi {it.rel}: {e}[/]")
        finally:
            progress.remove_task(task)


def message_link(entity, msg_id: int) -> str | None:
    username = getattr(entity, "username", None)
    if username:
        return f"https://t.me/{username}/{msg_id}"
    if entity.__class__.__name__ == "Channel":
        return f"https://t.me/c/{entity.id}/{msg_id}"
    return None


async def send_summary(client, entity, results) -> None:
    done = results["done"]
    if not done:
        return
    by_folder: dict[str, list] = defaultdict(list)
    for it, ids in done:
        by_folder[" / ".join(it.folder_parts)].append((it, ids))
    lines = [f"📊 Tổng kết upload {datetime.now():%d/%m/%Y %H:%M}",
             f"✅ {len(done)} file · {human(sum(i.size for i, _ in done))}"]
    if results["failed"]:
        lines.append(f"❌ {len(results['failed'])} file lỗi (sẽ thử lại lượt sau)")
    for folder, its in sorted(by_folder.items()):
        lines.append(f"\n📁 {folder}")
        for it, ids in its:
            link = message_link(entity, ids[0])
            name = f"[{it.path.name}]({link})" if link else it.path.name
            extra = f" ({len(ids)} phần)" if len(ids) > 1 else ""
            lines.append(f"• {name} — {human(it.size)}{extra}")
    text = "\n".join(lines)
    for i in range(0, len(text), 4000):  # giới hạn 4096 ký tự/tin
        await client.send_message(entity, text[i:i + 4000], link_preview=False)


async def run_upload(cfg: dict, dry_run: bool = False) -> None:
    limit = LIMIT_PREMIUM if cfg["premium"] else LIMIT_NORMAL
    items, fresh = scan(cfg)
    print_stats(items, fresh, limit)
    if not items:
        console.print("Không có file nào cần upload.")
        return
    # Thứ tự logic: theo folder rồi tên file, để tin nhắn trong Telegram xếp đúng cây thư mục.
    items.sort(key=lambda i: (str(i.root), str(i.rel.parent), i.path.name.lower()))
    if dry_run:
        console.print("\n[bold]Dry-run — caption mẫu:[/]")
        for it in items[:5]:
            n = -(-it.size // limit)
            console.print(f"[cyan]{build_caption(it, 1, n)}[/]\n")
        return

    conn = db()
    client = await get_client(cfg)
    try:
        entity = await resolve_target(client, cfg["target"])
        results = {"done": [], "failed": [], "skipped": []}
        sem = asyncio.Semaphore(max(1, int(cfg["concurrency"])))
        columns = (TextColumn("{task.description}"), BarColumn(), DownloadColumn(),
                   TransferSpeedColumn(), TimeRemainingColumn())
        with Progress(*columns, console=console) as progress:
            # Chia theo folder: các folder xong lần lượt, trong folder thì song song.
            groups: dict[str, list[Item]] = defaultdict(list)
            for it in items:
                groups["/".join(it.folder_parts)].append(it)
            for _, group in groups.items():
                await asyncio.gather(*(upload_one(client, entity, it, cfg, limit, conn, progress, sem, results)
                                       for it in group))
        if cfg["move_to_trash"]:
            for root in cfg["folders"]:
                if root.exists():
                    cleanup_empty_dirs(root)
        await send_summary(client, entity, results)
        console.print(f"[green]Xong:[/] {len(results['done'])} upload, {len(results['skipped'])} đã có, "
                      f"[red]{len(results['failed'])} lỗi[/]")
        notify_mac("TeleUploader", f"Đã upload {len(results['done'])} file, lỗi {len(results['failed'])}")
    finally:
        await client.disconnect()
        conn.close()


def notify_mac(title: str, text: str) -> None:
    if platform.system() == "Darwin":
        clean = lambda x: x.replace("\\", "").replace('"', "'")
        subprocess.run(["osascript", "-e", f'display notification "{clean(text)}" with title "{clean(title)}"'],
                       capture_output=True)


# ---------------------------------------------------------------- tìm & tải lại
PART_RE = re.compile(r"phần (\d+)/(\d+)")


def caption_info(msg) -> tuple[str, int, int]:
    """(tên file gốc, phần, tổng số phần) đọc từ caption do app tạo."""
    text = msg.message or ""
    name = next((l[2:].strip() for l in text.splitlines() if l.startswith("📄")), None)
    if not name and msg.file and msg.file.name:
        name = re.sub(r"\.part\d{3}$", "", msg.file.name)
    m = PART_RE.search(text)
    return name or f"file_{msg.id}", int(m.group(1)) if m else 1, int(m.group(2)) if m else 1


async def search_files(client, entity, query: str, limit: int = 100) -> dict[str, list]:
    """Gom kết quả theo file gốc: {tên: [msg phần 1, phần 2, ...]}."""
    groups: dict[str, dict[int, object]] = defaultdict(dict)
    async for msg in client.iter_messages(entity, search=query, limit=limit):
        if not msg.file:
            continue
        name, part, _ = caption_info(msg)
        groups[name].setdefault(part, msg)
    return {k: [v[i] for i in sorted(v)] for k, v in groups.items()}


async def run_find(cfg: dict, query: str) -> None:
    client = await get_client(cfg)
    try:
        entity = await resolve_target(client, cfg["target"])
        groups = await search_files(client, entity, query)
        if not groups:
            console.print(f"Không tìm thấy “{query}” trên Telegram.")
            return
        t = Table(title=f"Kết quả “{query}” trong {cfg['target']}")
        for col in ("ID", "File", "Folder", "Size", "Phần", "Ngày up", "Link"):
            t.add_column(col, overflow="fold")
        for name, msgs in sorted(groups.items()):
            first = msgs[0]
            _, _, total = caption_info(first)
            folder = next((l[2:].strip() for l in (first.message or "").splitlines() if l.startswith("📁")), "")
            size = sum(m.file.size or 0 for m in msgs)
            parts = f"{len(msgs)}/{total}" + (" [red]thiếu[/]" if len(msgs) < total else "")
            t.add_row(str(first.id), name, folder, human(size), parts,
                      f"{first.date.astimezone():%d/%m/%Y}", message_link(entity, first.id) or "")
        console.print(t)
        console.print("Tải về: [cyan]./run.sh get <ID>[/] hoặc [cyan]./run.sh get \"tên file\"[/]")
    finally:
        await client.disconnect()


async def fetch_file(client, entity, key: str, out_dir: Path, progress) -> Path:
    """Tải 1 file (theo ID tin nhắn hoặc tên), tự ghép nếu bị split. Lỗi → ValueError."""
    if key.isdigit():
        msg = await client.get_messages(entity, ids=int(key))
        if not msg or not msg.file:
            raise ValueError(f"Tin nhắn {key} không có file.")
        name, _, total = caption_info(msg)
        msgs = [msg] if total == 1 else (await search_files(client, entity, name)).get(name, [])
    else:
        groups = await search_files(client, entity, key)
        exact = {k: v for k, v in groups.items() if k.lower() == key.lower()}
        groups = exact or groups
        if len(groups) != 1:
            raise ValueError(f"Có {len(groups)} file khớp — hãy tìm rồi tải theo ID.")
        (name, msgs), = groups.items()
        total = caption_info(msgs[0])[2]
    if len(msgs) < total:
        raise ValueError(f"Chỉ tìm thấy {len(msgs)}/{total} phần của {name}.")

    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / name
    i = 1
    while dest.exists():
        dest = out_dir / f"{Path(name).stem} ({i}){Path(name).suffix}"
        i += 1
    tmp = SPLIT_DIR / f"dl_{msgs[0].id}"
    tmp.mkdir(parents=True, exist_ok=True)
    paths = []
    for n, m in enumerate(msgs, 1):
        task = progress.add_task(f"{name[:40]} ({n}/{len(msgs)})", total=m.file.size)
        target = tmp / f"part{n:03d}"
        if not (target.exists() and target.stat().st_size == m.file.size):  # tải tiếp nếu bị ngắt
            await client.download_media(m, file=str(target),
                                        progress_callback=lambda d, t_, k=task: progress.update(k, completed=d, total=t_))
        progress.update(task, completed=m.file.size)
        progress.remove_task(task)
        paths.append(target)
    if len(paths) == 1:
        shutil.move(paths[0], dest)
    else:
        console.print(f"Ghép {len(paths)} phần…")
        with open(dest, "wb") as out:
            for p in paths:
                with open(p, "rb") as src:
                    shutil.copyfileobj(src, out, 8 * MiB)
    shutil.rmtree(tmp, ignore_errors=True)
    return dest


async def run_get(cfg: dict, key: str, out_dir: Path) -> None:
    client = await get_client(cfg)
    try:
        entity = await resolve_target(client, cfg["target"])
        columns = (TextColumn("{task.description}"), BarColumn(), DownloadColumn(),
                   TransferSpeedColumn(), TimeRemainingColumn())
        with Progress(*columns, console=console) as progress:
            try:
                dest = await fetch_file(client, entity, key, out_dir, progress)
            except ValueError as e:
                console.print(f"[red]{e}[/]")
                return
        console.print(f"[green]Đã tải:[/] {dest} ({human(dest.stat().st_size)})")
        if platform.system() == "Darwin":
            subprocess.run(["open", "-R", str(dest)])  # hiện file trong Finder
    finally:
        await client.disconnect()


# ---------------------------------------------------------------- commands
def cmd_history() -> None:
    conn = db()
    t = Table(title="Lịch sử upload")
    for col in ("Thời gian", "File", "Size", "Phần", "Trash"):
        t.add_column(col)
    for when, rel, root, size, parts, trashed in conn.execute(
            "SELECT uploaded_at, rel, root, size, parts, trashed FROM uploads ORDER BY uploaded_at DESC LIMIT 200"):
        t.add_row(when, f"{Path(root).name}/{rel}", human(size), str(parts), "✓" if trashed else "")
    console.print(t)


def main() -> None:
    ap = argparse.ArgumentParser(description="Tự động upload file lên Telegram")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("login")
    sub.add_parser("scan")
    up = sub.add_parser("upload")
    up.add_argument("--dry-run", action="store_true", help="chỉ xem trước, không upload")
    sub.add_parser("watch")
    sub.add_parser("history")
    fd = sub.add_parser("find", help="tìm file đã up trên Telegram")
    fd.add_argument("query")
    gt = sub.add_parser("get", help="tải file về (tự ghép nếu bị split)")
    gt.add_argument("key", help="ID tin nhắn hoặc tên file")
    gt.add_argument("--to", type=Path, default=Path("~/Downloads/TeleUploader").expanduser())
    args = ap.parse_args()

    if args.cmd == "history":
        return cmd_history()
    cfg = load_config()
    if args.cmd == "login":
        async def _login():
            c = await get_client(cfg)
            me = await c.get_me()
            console.print(f"[green]Đăng nhập OK:[/] {me.first_name} (@{me.username}) · Premium: {bool(me.premium)}")
            await c.disconnect()
        asyncio.run(_login())
    elif args.cmd == "scan":
        items, fresh = scan(cfg)
        print_stats(items, fresh, LIMIT_PREMIUM if cfg["premium"] else LIMIT_NORMAL)
        console.print(f"Đã lưu báo cáo CSV: {save_report(items)}")
    elif args.cmd == "upload":
        asyncio.run(run_upload(cfg, args.dry_run))
    elif args.cmd == "find":
        asyncio.run(run_find(cfg, args.query))
    elif args.cmd == "get":
        asyncio.run(run_get(cfg, args.key, args.to.expanduser()))
    elif args.cmd == "watch":
        console.print(f"[bold]Watch mode[/] — quét mỗi {cfg['watch_interval_seconds']}s. Ctrl+C để dừng.")
        while True:
            try:
                asyncio.run(run_upload(cfg))
            except KeyboardInterrupt:
                break
            except Exception as e:  # noqa: BLE001
                console.print(f"[red]Lỗi lượt chạy: {e}[/]")
            try:
                time.sleep(cfg["watch_interval_seconds"])
            except KeyboardInterrupt:
                break


if __name__ == "__main__":
    main()
