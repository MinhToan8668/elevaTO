#!/usr/bin/env python3
"""TeleUploader app — giao diện cửa sổ cho TeleUploader, Video Sorter, Disk Report.

Mở: bấm đúp TeleUploader.app (do install.sh tạo) hoặc `python gui.py`.
Giao diện là trang web chạy nội bộ trên máy (127.0.0.1), hiển thị trong cửa sổ riêng.
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import platform
import secrets
import socket
import subprocess
import threading
import time
import traceback
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import yaml
from flask import Flask, abort, jsonify, request, send_file, send_from_directory
from rich.console import Console

import app as core
import disk_report as dr
import media_tools as mt
import video_sorter as vs

HERE = Path(__file__).resolve().parent
TOKEN = secrets.token_urlsafe(16)
MiB = 1024 * 1024


# ---------------------------------------------------------------- trạng thái chung
class State:
    def __init__(self):
        self.lock = threading.Lock()
        self.log: list[dict] = []
        self.notifications: list[dict] = []
        self.transfers: dict[int, dict] = {}   # thanh tiến độ đang chạy
        self.uploading = False
        self.watch = False
        self.last_round: dict | None = None
        self.busy: dict[str, str] = {}         # việc nặng đang chạy: {"disk": "Đang quét…"}
        self.results: dict[str, object] = {}   # kết quả disk/sort/find
        self.me: dict | None = None
        self.login_step = "idle"               # idle | need_phone | need_code | need_password | ok
        self._seq = 0

    def add_log(self, text: str, level: str = "info"):
        text = text.rstrip()
        if not text:
            return
        with self.lock:
            self.log.append({"t": time.time(), "text": text, "level": level})
            del self.log[:-500]

    def notify(self, title: str, text: str, level: str = "info", mac: bool = True):
        with self.lock:
            self._seq += 1
            self.notifications.insert(0, {"id": self._seq, "t": time.time(), "title": title, "text": text,
                                          "level": level, "read": False})
            del self.notifications[200:]
        self.add_log(f"{title}: {text}", level)
        if mac:
            core.notify_mac(title, text)


S = State()


class LogFile:
    """Thay cho terminal: mọi console.print của các module ghi vào nhật ký app."""
    def write(self, s):
        for line in s.splitlines():
            low = line.lower()
            S.add_log(line, "error" if ("lỗi" in low or "error" in low) else "warn" if "chờ" in low else "info")
        return len(s)

    def flush(self):
        pass


_log_console = Console(file=LogFile(), width=200, force_terminal=False, color_system=None)
core.console = vs.console = dr.console = _log_console


class GuiProgress:
    """Giả lập rich.Progress để tái dùng code upload/tải, đẩy tiến độ lên giao diện."""
    _ids = 0

    def __init__(self, kind: str):
        self.kind = kind

    def add_task(self, description, total=None, **_):
        GuiProgress._ids += 1
        with S.lock:
            S.transfers[GuiProgress._ids] = {"kind": self.kind, "desc": description, "done": 0, "total": total or 0,
                                             "start": time.time(), "speed": 0, "_last": (time.time(), 0)}
        return GuiProgress._ids

    def update(self, task, description=None, completed=None, total=None, **_):
        with S.lock:
            t = S.transfers.get(task)
            if not t:
                return
            if description is not None:
                t["desc"] = description
            if total is not None:
                t["total"] = total
            if completed is not None:
                now = time.time()
                lt, ld = t["_last"]
                if completed < ld:  # sang phần mới
                    t["_last"] = (now, completed)
                elif now - lt >= 1:
                    t["speed"] = (completed - ld) / (now - lt)
                    t["_last"] = (now, completed)
                t["done"] = completed

    def remove_task(self, task):
        with S.lock:
            S.transfers.pop(task, None)


# ---------------------------------------------------------------- config
def read_cfg() -> dict:
    p = core.CONFIG_PATH
    if not p.exists():
        src = HERE / "config.example.yaml"
        p.write_text(src.read_text(encoding="utf-8") if src.exists() else "", encoding="utf-8")
    return yaml.safe_load(p.read_text(encoding="utf-8")) or {}


def write_cfg(cfg: dict) -> None:
    core.CONFIG_PATH.write_text(yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False), encoding="utf-8")


def runtime_cfg() -> dict:
    """Giống core.load_config nhưng không thoát chương trình khi thiếu cấu hình."""
    cfg = read_cfg()
    for k, v in {"target": "me", "premium": False, "move_to_trash": True, "min_file_age_seconds": 120,
                 "ignore": [".*"], "send_as_document": True, "concurrency": 2, "watch_interval_seconds": 300}.items():
        cfg.setdefault(k, v)
    cfg["folders"] = [Path(os.path.expanduser(f)).resolve() for f in cfg.get("folders") or []]
    return cfg


def limit_of(cfg) -> int:
    return core.LIMIT_PREMIUM if cfg["premium"] else core.LIMIT_NORMAL


# ---------------------------------------------------------------- Telegram (vòng lặp async riêng)
LOOP = asyncio.new_event_loop()
threading.Thread(target=LOOP.run_forever, daemon=True, name="telegram").start()


def run_tg(coro, timeout=120):
    return asyncio.run_coroutine_threadsafe(coro, LOOP).result(timeout)


class TG:
    client = None
    key = None
    phone = None
    upload_task: asyncio.Task | None = None
    watch_task: asyncio.Task | None = None


async def ensure_client(require_login=True):
    from telethon import TelegramClient
    cfg = runtime_cfg()
    if not cfg.get("api_id") or not cfg.get("api_hash") or str(cfg.get("api_id")) == "123456":
        S.login_step = "need_api"
        raise ValueError("Chưa nhập API ID / API Hash trong Cài đặt.")
    key = (str(cfg["api_id"]), cfg["api_hash"])
    if TG.client is None or TG.key != key:
        if TG.client:
            await TG.client.disconnect()
        TG.client = TelegramClient(core.SESSION, int(cfg["api_id"]), cfg["api_hash"],
                                   device_model="TeleUploader Mac", connection_retries=10, retry_delay=5)
        TG.key = key
    if not TG.client.is_connected():
        await TG.client.connect()
    if await TG.client.is_user_authorized():
        if not S.me:
            me = await TG.client.get_me()
            S.me = {"name": " ".join(filter(None, [me.first_name, me.last_name])), "username": me.username,
                    "premium": bool(getattr(me, "premium", False))}
        S.login_step = "ok"
    elif require_login:
        S.login_step = "need_phone" if S.login_step not in ("need_code", "need_password") else S.login_step
        raise ValueError("Chưa đăng nhập Telegram — vào Cài đặt để đăng nhập.")
    return TG.client


async def upload_round():
    cfg = runtime_cfg()
    if not cfg["folders"]:
        raise ValueError("Chưa chọn folder cần upload (Cài đặt).")
    client = await ensure_client()
    entity = await core.resolve_target(client, cfg["target"])
    items, fresh = core.scan(cfg)
    items.sort(key=lambda i: (str(i.root), str(i.rel.parent), i.path.name.lower()))
    results = {"done": [], "failed": [], "skipped": []}
    S.uploading = True
    started = time.time()
    try:
        if not items:
            S.add_log("Không có file mới cần upload.")
            return
        S.add_log(f"Bắt đầu upload {len(items)} file ({core.human(sum(i.size for i in items))})")
        conn = core.db()
        sem = asyncio.Semaphore(max(1, int(cfg["concurrency"])))
        progress = GuiProgress("upload")
        groups = defaultdict(list)
        for it in items:
            groups["/".join(it.folder_parts)].append(it)
        try:
            for group in groups.values():
                await asyncio.gather(*(core.upload_one(client, entity, it, cfg, limit_of(cfg), conn, progress, sem, results)
                                       for it in group))
        finally:
            conn.close()
        if cfg["move_to_trash"]:
            for root in cfg["folders"]:
                if root.exists():
                    core.cleanup_empty_dirs(root)
        await core.send_summary(client, entity, results)
    finally:
        S.uploading = False
        done, failed = results["done"], results["failed"]
        S.last_round = {"at": time.time(), "done": len(done), "failed": len(failed), "skipped": len(results["skipped"]),
                        "bytes": sum(i.size for i, _ in done), "seconds": int(time.time() - started),
                        "errors": [{"file": str(i.rel), "error": e} for i, e in failed]}
        if done or failed:
            lvl = "error" if failed else "success"
            S.notify("Upload xong", f"{len(done)} file · {core.human(sum(i.size for i, _ in done))}"
                     + (f" · {len(failed)} lỗi" if failed else ""), lvl)
        for it, e in failed:
            S.notify("Upload lỗi", f"{it.rel}: {e}", "error", mac=False)


async def _guarded_round():
    try:
        await upload_round()
    except asyncio.CancelledError:
        S.notify("Đã dừng upload", "File đang up dở được giữ nguyên, lượt sau sẽ up lại.", "warn", mac=False)
        raise
    except Exception as e:  # noqa: BLE001
        S.notify("Không upload được", str(e), "error")


async def watch_loop():
    while S.watch:
        if not S.uploading:
            TG.upload_task = asyncio.ensure_future(_guarded_round())
            try:
                await TG.upload_task
            except asyncio.CancelledError:
                if not S.watch:
                    break
        await asyncio.sleep(max(30, int(runtime_cfg()["watch_interval_seconds"])))


# ---------------------------------------------------------------- việc nặng chạy nền
def background(name: str, label: str, fn):
    if name in S.busy:
        return False

    def runner():
        S.busy[name] = label
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            S.notify("Lỗi", f"{label}: {e}", "error")
        finally:
            S.busy.pop(name, None)
    threading.Thread(target=runner, daemon=True).start()
    return True


def file_row(p, s, m):
    return {"path": str(p), "name": Path(p).name, "size": s, "mtime": m}


def disk_job(roots: list[Path], min_big: int, old_days: int):
    files, dir_size = dr.walk(roots)
    S.busy["disk"] = "Đang tìm file trùng…"
    dups = dr.find_dups(files, 10 * MiB)
    now = time.time()

    class A:  # dr.suggestions cần object có min_big/old_days
        pass
    A.min_big, A.old_days = min_big, old_days
    uploaded = dr.uploaded_paths()
    du = __import__("shutil").disk_usage(roots[0])
    q = dr.queue_folder()
    sugg = [f for f in dr.suggestions(files, A) if not (q and str(f[0]).startswith(str(q) + os.sep))]
    dup_rows = []
    for g in sorted(dups, key=lambda g: -g[0].stat().st_size)[:100]:
        size = g[0].stat().st_size
        dup_rows.append({"size": size, "waste": size * (len(g) - 1), "paths": [str(p) for p in g]})
    by_ext = defaultdict(int)
    for p, s, *_ in files:
        by_ext[p.suffix.lower() or "(không đuôi)"] += s
    S.results["disk"] = {
        "at": now, "roots": [str(r) for r in roots], "free": du.free, "disk_total": du.total,
        "scanned": sum(f[1] for f in files), "count": len(files),
        "top_dirs": [{"path": str(d), "size": s} for d, s in
                     sorted(((d, s) for d, s in dir_size.items() if d not in roots), key=lambda x: -x[1])[:30]],
        "biggest": [file_row(p, s, m) | {"uploaded": str(p) in uploaded} for p, s, m, _ in
                    sorted(files, key=lambda f: -f[1])[:50]],
        "suggest": [file_row(p, s, m) for p, s, m, _ in sugg],
        "dups": dup_rows, "dup_waste": sum(d["waste"] for d in dup_rows),
        "types": [{"ext": e, "size": s} for e, s in sorted(by_ext.items(), key=lambda x: -x[1])[:12]],
    }
    S.notify("Quét ổ cứng xong", f"{len(files):,} file · gợi ý dọn {core.human(sum(f[1] for f in sugg))}",
             "success")


# ---------------------------------------------------------------- web server
web = Flask(__name__, static_folder=None)


@web.before_request
def check_token():
    if request.path.startswith("/api/") and request.headers.get("X-Token") != TOKEN:
        abort(403)
    # <video>/<img> không gửi được header → dùng token trên URL
    if request.path.startswith("/media/") and request.args.get("t") != TOKEN:
        abort(403)


@web.get("/")
def index():
    if request.args.get("t") != TOKEN:
        abort(403)
    return send_file(HERE / "ui" / "index.html")


@web.get("/assets/<path:name>")
def assets(name):
    return send_from_directory(HERE / "ui" / "assets", name, max_age=86400)


def body():
    return request.get_json(silent=True) or {}


def ok(**kw):
    return jsonify({"ok": True, **kw})


def err(msg, code=400):
    return jsonify({"ok": False, "error": str(msg)}), code


@web.get("/api/state")
def api_state():
    since = float(request.args.get("since", 0))
    with S.lock:
        transfers = [{k: v for k, v in t.items() if not k.startswith("_")} | {"id": i} for i, t in S.transfers.items()]
        return jsonify({
            "uploading": S.uploading, "watch": S.watch, "busy": S.busy, "last_round": S.last_round,
            "transfers": transfers, "log": [l for l in S.log if l["t"] > since][-200:],
            "notifications": S.notifications[:50], "unread": sum(not n["read"] for n in S.notifications),
            "me": S.me, "login_step": S.login_step, "platform": platform.system(),
            "stamps": {k: v.get("at") for k, v in S.results.items() if isinstance(v, dict)},
        })


@web.post("/api/notifications/read")
def api_read():
    with S.lock:
        for n in S.notifications:
            n["read"] = True
    return ok()


@web.post("/api/notifications/clear")
def api_clear():
    with S.lock:
        S.notifications.clear()
    return ok()


# ---- cài đặt & đăng nhập
@web.get("/api/config")
def api_get_config():
    cfg = read_cfg()
    cfg.setdefault("video_sorter", {})
    return jsonify(cfg)


@web.post("/api/config")
def api_set_config():
    cfg = read_cfg()
    new = body()
    for k in ("api_id", "api_hash", "target", "folders", "premium", "move_to_trash", "min_file_age_seconds",
              "send_as_document", "concurrency", "watch_interval_seconds", "video_sorter"):
        if k in new:
            cfg[k] = new[k]
    if "api_id" in new and str(new["api_id"]).strip().isdigit():
        cfg["api_id"] = int(new["api_id"])
    write_cfg(cfg)
    S.add_log("Đã lưu cài đặt.")
    return ok()


@web.post("/api/login/check")
def api_login_check():
    try:
        run_tg(ensure_client(require_login=False))
        if S.login_step != "ok":
            S.login_step = "need_phone"
        return ok(step=S.login_step, me=S.me)
    except Exception as e:  # noqa: BLE001
        return err(e)


@web.post("/api/login/phone")
def api_login_phone():
    phone = str(body().get("phone", "")).replace(" ", "")
    if not phone:
        return err("Nhập số điện thoại dạng +84…")

    async def go():
        c = await ensure_client(require_login=False)
        await c.send_code_request(phone)
        TG.phone = phone
    try:
        run_tg(go())
        S.login_step = "need_code"
        return ok(step="need_code")
    except Exception as e:  # noqa: BLE001
        return err(e)


@web.post("/api/login/code")
def api_login_code():
    from telethon.errors import SessionPasswordNeededError
    code = str(body().get("code", "")).strip()

    async def go():
        c = await ensure_client(require_login=False)
        try:
            await c.sign_in(TG.phone, code)
        except SessionPasswordNeededError:
            S.login_step = "need_password"
            return
        S.me = None
        await ensure_client()
    try:
        run_tg(go())
        if S.login_step == "ok":
            S.notify("Đăng nhập thành công", f"Xin chào {S.me['name']}", "success", mac=False)
        return ok(step=S.login_step, me=S.me)
    except Exception as e:  # noqa: BLE001
        return err(e)


@web.post("/api/login/password")
def api_login_password():
    pw = body().get("password", "")

    async def go():
        c = await ensure_client(require_login=False)
        await c.sign_in(password=pw)
        S.me = None
        await ensure_client()
    try:
        run_tg(go())
        S.notify("Đăng nhập thành công", f"Xin chào {S.me['name']}", "success", mac=False)
        return ok(step=S.login_step, me=S.me)
    except Exception as e:  # noqa: BLE001
        return err(e)


@web.post("/api/logout")
def api_logout():
    async def go():
        c = await ensure_client(require_login=False)
        await c.log_out()
        TG.client = None
    try:
        run_tg(go())
    except Exception as e:  # noqa: BLE001
        return err(e)
    S.me, S.login_step = None, "need_phone"
    return ok()


# ---- tổng quan & upload
@web.post("/api/scan")
def api_scan():
    cfg = runtime_cfg()
    if not cfg["folders"]:
        return ok(folders=[], cats=[], total=0, count=0, big=0, fresh=0, missing=[])
    items, fresh = core.scan(cfg)
    lim = limit_of(cfg)
    by_folder, by_cat = defaultdict(list), defaultdict(list)
    for it in items:
        by_folder["/".join(it.folder_parts)].append(it)
        by_cat[core.category_of(it.path)].append(it)
    return ok(
        folders=[{"name": k, "count": len(v), "size": sum(i.size for i in v), "big": sum(i.size > lim for i in v)}
                 for k, v in sorted(by_folder.items())],
        cats=[{"name": k, "count": len(v), "size": sum(i.size for i in v)}
              for k, v in sorted(by_cat.items(), key=lambda kv: -sum(i.size for i in kv[1]))],
        total=sum(i.size for i in items), count=len(items), big=sum(i.size > lim for i in items),
        fresh=len(fresh), missing=[str(f) for f in cfg["folders"] if not f.exists()],
        files=[{"path": str(i.path), "rel": "/".join(i.folder_parts[1:] + [i.path.name]), "root": i.root.name,
                "size": i.size, "split": i.size > lim, "cat": core.category_of(i.path)} for i in items[:500]],
    )


@web.post("/api/upload/start")
def api_upload_start():
    if S.uploading:
        return err("Đang upload rồi.")
    try:
        run_tg(ensure_client(), timeout=30)
    except Exception as e:  # noqa: BLE001
        return err(e)
    TG.upload_task = asyncio.run_coroutine_threadsafe(_start_round(), LOOP).result()
    return ok()


async def _start_round():
    return asyncio.ensure_future(_guarded_round())


@web.post("/api/upload/stop")
def api_upload_stop():
    t = TG.upload_task
    if t and not t.done():
        LOOP.call_soon_threadsafe(t.cancel)
    return ok()


@web.post("/api/watch")
def api_watch():
    on = bool(body().get("on"))
    if on and not S.watch:
        try:
            run_tg(ensure_client(), timeout=30)
        except Exception as e:  # noqa: BLE001
            return err(e)
        S.watch = True
        TG.watch_task = asyncio.run_coroutine_threadsafe(_start_watch(), LOOP).result()
        S.notify("Tự động upload: BẬT", "App sẽ tự quét và upload file mới.", "info", mac=False)
    elif not on and S.watch:
        S.watch = False
        if TG.watch_task:
            LOOP.call_soon_threadsafe(TG.watch_task.cancel)
        S.notify("Tự động upload: TẮT", "Lượt đang chạy (nếu có) vẫn chạy cho xong.", "info", mac=False)
    return ok(watch=S.watch)


async def _start_watch():
    return asyncio.ensure_future(watch_loop())


@web.get("/api/history")
def api_history():
    conn = core.db()
    rows = conn.execute("SELECT uploaded_at, rel, root, size, parts, trashed, message_ids FROM uploads "
                        "ORDER BY uploaded_at DESC LIMIT 300").fetchall()
    conn.close()
    return jsonify([{"at": a, "rel": r, "root": Path(ro).name, "size": s, "parts": p, "trashed": bool(t),
                     "msg": (m or "").split(",")[0]} for a, r, ro, s, p, t, m in rows])


# ---- sắp xếp video
def _sort_cfg():
    cfg = vs.load_cfg()
    return cfg


@web.post("/api/sort/preview")
def api_sort_preview():
    b = body()
    sources = [Path(os.path.expanduser(s)).resolve() for s in b.get("sources") or [] if s]
    if b.get("cards"):
        sources += vs.card_sources()
    if not sources:
        return err("Chọn folder nguồn hoặc tick 'Lấy từ thẻ nhớ'." if not b.get("cards") else "Không thấy thẻ nhớ nào đang cắm.")
    project = b.get("project", "")
    copy = bool(b.get("copy"))

    def job():
        cfg = _sort_cfg()
        if copy:
            cfg["move"] = False
        files = vs.collect(sources, cfg)
        rows = vs.plan(files, project, cfg) if files else []
        S.results["sort"] = {"rows": rows, "cfg": cfg, "dups": b.get("dups", "move"), "at": time.time()}
        if not files:
            S.notify("Sắp xếp video", "Không tìm thấy video/ảnh nào trong nguồn đã chọn.", "warn", mac=False)
    if not background("sort", "Đang đọc ngày quay & kiểm tra trùng…", job):
        return err("Đang xử lý, chờ chút.")
    return ok()


@web.get("/api/sort/result")
def api_sort_result():
    r = S.results.get("sort")
    if not r or r.get("rows") is None:
        return ok(rows=None)
    lib = r["cfg"]["library"]
    out = []
    for x in r["rows"]:
        out.append({"src": str(x["src"]), "name": x["src"].name, "date": x["date"].strftime("%d/%m/%Y %H:%M"),
                    "source": x["source"], "status": x["status"], "dup_of": x["dup_of"],
                    "dst": str(x["dst"].relative_to(lib)) if x["dst"] else None,
                    "size": x["src"].stat().st_size if x["src"].exists() else 0})
    return ok(rows=out, library=str(lib), applied=r.get("applied", False), ffprobe=bool(vs.shutil.which("ffprobe")))


@web.post("/api/sort/apply")
def api_sort_apply():
    r = S.results.get("sort")
    if not r or not r.get("rows") or r.get("applied"):
        return err("Hãy bấm Xem trước trước.")

    def job():
        log_p = vs.apply(r["rows"], r["cfg"], r["dups"])
        r["applied"] = True
        r["at"] = time.time()
        n = sum(x["status"] != "trùng" for x in r["rows"])
        d = len(r["rows"]) - n
        S.notify("Sắp xếp xong", f"{n} file đã vào thư viện" + (f", {d} file trùng" if d else ""), "success")
        S.add_log(f"Nhật ký sắp xếp: {log_p}")
    if not background("sort", "Đang sắp xếp…", job):
        return err("Đang xử lý, chờ chút.")
    return ok()


@web.post("/api/sort/undo")
def api_sort_undo():
    def job():
        vs.undo()
        S.results["sort"] = {"at": time.time(), "rows": None}
        S.notify("Đã hoàn tác", "Các file đã về lại chỗ cũ.", "success", mac=False)
    background("sort", "Đang hoàn tác…", job)
    return ok()


# ---- ổ cứng
@web.post("/api/disk/scan")
def api_disk_scan():
    b = body()
    roots = [Path(os.path.expanduser(s)).resolve() for s in b.get("roots") or [] if s] or [Path.home()]
    roots = [r for r in roots if r.exists()]
    if not roots:
        return err("Folder không tồn tại.")
    if not background("disk", "Đang quét ổ cứng…",
                      lambda: disk_job(roots, int(b.get("min_big", 300)), int(b.get("old_days", 90)))):
        return err("Đang quét rồi.")
    return ok()


@web.get("/api/disk/result")
def api_disk_result():
    return ok(result=S.results.get("disk"))


@web.post("/api/disk/queue")
def api_disk_queue():
    paths = body().get("paths") or []
    q = dr.queue_folder()
    if not q:
        return err("Chưa có folder upload — vào Cài đặt thêm folder trước.")
    n = dr.queue_files([Path(p) for p in paths], q)
    S.notify("Đã chuyển vào hàng chờ upload", f"{n} file → {q}", "success", mac=False)
    return ok(moved=n, queue=str(q))


@web.post("/api/trash")
def api_trash():
    paths = body().get("paths") or []
    n = 0
    for p in paths:
        if Path(p).exists():
            core.move_to_trash(Path(p))
            n += 1
    S.notify("Đã chuyển vào Thùng rác", f"{n} file", "success", mac=False)
    return ok(trashed=n)


# ---- cắt & gộp
def media_job(label: str, fn):
    """Chạy việc cắt/gộp ở nền, có thanh tiến độ; xong thì báo và mở Finder."""
    def job():
        prog = GuiProgress("media")
        task = prog.add_task(label, total=1)
        try:
            outs = fn(lambda d, t, l: prog.update(task, description=l, completed=d, total=t))
        finally:
            prog.remove_task(task)
        outs = outs if isinstance(outs, list) else [outs]
        S.results["media"] = {"at": time.time(), "outputs": [{"path": str(o), "name": o.name, "size": o.stat().st_size}
                                                             for o in outs]}
        S.notify(label + " xong", f"{len(outs)} file · {core.human(sum(o.stat().st_size for o in outs))}", "success")
        open_in_finder(outs[0])
    if not background("media", label + "…", job):
        return err("Đang xử lý một việc khác, chờ chút.")
    return ok()


@web.post("/api/media/probe")
def api_media_probe():
    try:
        out = []
        for p in body().get("paths") or []:
            p = Path(p)
            info = mt.probe(p) if p.suffix.lower().lstrip(".") in vs.VIDEO else {"size": p.stat().st_size}
            out.append({"path": str(p), "name": p.name, **info})
        return ok(items=out)
    except Exception as e:  # noqa: BLE001
        return err(e)


@web.post("/api/media/split_video")
def api_split_video():
    b = body()
    return media_job("Cắt video", lambda pr: mt.split_video(Path(b["path"]), b["mode"], str(b["value"]), progress=pr,
                                                             precise=bool(b.get("precise")), join=bool(b.get("join"))))


# ---- xem trước video trong app
PLAYABLE_EXT = {"mp4", "mov", "m4v", "webm"}
PLAYABLE_CODEC = {"h264", "hevc", "vp8", "vp9", "av1", None}
OPENED: dict[str, dict] = {}   # id → {"src": file gốc, "play": file để phát}


@web.post("/api/media/open")
def api_media_open():
    p = Path(body().get("path", ""))
    if not p.is_file():
        return err("Không thấy file.")
    try:
        info = mt.probe(p)
    except Exception as e:  # noqa: BLE001
        return err(e)
    vid = hashlib.sha1(str(p).encode()).hexdigest()[:12]
    OPENED[vid] = {"src": p, "play": p}
    cached = core.SPLIT_DIR / "preview" / f"{vid}.mp4"
    playable = p.suffix.lower().lstrip(".") in PLAYABLE_EXT and info["vcodec"] in PLAYABLE_CODEC
    if not playable and cached.exists():
        OPENED[vid]["play"], playable = cached, True
    return ok(id=vid, path=str(p), name=p.name, playable=playable, **info)


def _opened(vid):
    v = OPENED.get(vid)
    if not v:
        abort(404)
    return v


@web.get("/media/stream/<vid>")
def media_stream(vid):
    return send_file(_opened(vid)["play"], conditional=True)  # hỗ trợ Range → tua được


@web.get("/media/thumbs/<vid>")
def media_thumbs(vid):
    v = _opened(vid)
    n = max(4, min(30, int(request.args.get("n", 12))))
    out = core.SPLIT_DIR / "preview" / f"{vid}_{n}.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    if not out.exists():
        try:
            mt.thumbnails(v["src"], out, count=n)
        except Exception:  # noqa: BLE001
            abort(404)
    return send_file(out, max_age=3600)


@web.post("/api/media/make_preview")
def api_make_preview():
    vid = body().get("id")
    v = _opened(vid)
    out = core.SPLIT_DIR / "preview" / f"{vid}.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)

    def job():
        prog = GuiProgress("media")
        task = prog.add_task("Tạo bản xem trước", total=1)
        try:
            mt.make_preview(v["src"], out, lambda d, t, l: prog.update(task, description=l, completed=d, total=t))
        finally:
            prog.remove_task(task)
        v["play"] = out
        S.results["preview"] = {"at": time.time(), "id": vid}
    if not background("media", "Đang tạo bản xem trước…", job):
        return err("Đang xử lý một việc khác, chờ chút.")
    return ok()


@web.post("/api/media/merge")
def api_merge():
    b = body()
    return media_job("Gộp video", lambda pr: mt.merge_videos([Path(p) for p in b["paths"]],
                                                              reencode=bool(b.get("reencode")), progress=pr))


@web.post("/api/media/split_file")
def api_split_file():
    b = body()
    return media_job("Chia file", lambda pr: mt.split_file(Path(b["path"]), float(b["mb"]), progress=pr))


@web.post("/api/media/join")
def api_join():
    b = body()
    return media_job("Ghép file", lambda pr: mt.join_files([Path(p) for p in b["paths"]], progress=pr))


@web.get("/api/media/result")
def api_media_result():
    return ok(result=S.results.get("media"))


@web.post("/api/media/parts")
def api_parts():
    try:
        parts = mt.find_parts(Path(body().get("path", "")))
        return ok(items=[{"path": str(p), "name": p.name, "size": p.stat().st_size} for p in parts])
    except Exception as e:  # noqa: BLE001
        return err(e)


# ---- tìm & tải
@web.post("/api/find")
def api_find():
    q = str(body().get("q", "")).strip()
    if not q:
        return err("Nhập từ khoá.")

    async def go():
        c = await ensure_client()
        entity = await core.resolve_target(c, runtime_cfg()["target"])
        groups = await core.search_files(c, entity, q)
        out = []
        for name, msgs in sorted(groups.items()):
            first = msgs[0]
            _, _, total = core.caption_info(first)
            folder = next((l[2:].strip() for l in (first.message or "").splitlines() if l.startswith("📁")), "")
            out.append({"id": first.id, "name": name, "folder": folder, "size": sum(m.file.size or 0 for m in msgs),
                        "parts": len(msgs), "total": total, "date": first.date.astimezone().strftime("%d/%m/%Y"),
                        "link": core.message_link(entity, first.id)})
        return out
    try:
        return ok(items=run_tg(go(), timeout=60))
    except Exception as e:  # noqa: BLE001
        return err(e)


@web.post("/api/get")
def api_get():
    key = str(body().get("id", ""))
    out_dir = Path(os.path.expanduser(body().get("to") or "~/Downloads/TeleUploader"))

    async def go():
        try:
            c = await ensure_client()
            entity = await core.resolve_target(c, runtime_cfg()["target"])
            dest = await core.fetch_file(c, entity, key, out_dir, GuiProgress("download"))
            S.notify("Tải xong", f"{dest.name} ({core.human(dest.stat().st_size)})", "success")
            open_in_finder(dest)
        except Exception as e:  # noqa: BLE001
            S.notify("Tải lỗi", str(e), "error")
    asyncio.run_coroutine_threadsafe(go(), LOOP)
    return ok()


def open_in_finder(path: Path):
    if platform.system() == "Darwin":
        subprocess.run(["open", "-R", str(path)])


@web.post("/api/reveal")
def api_reveal():
    p = Path(body().get("path", ""))
    if p.exists():
        open_in_finder(p)
    return ok()


@web.post("/api/open_url")
def api_open_url():
    url = body().get("url", "")
    if url.startswith("https://t.me/"):
        import webbrowser
        webbrowser.open(url)
    return ok()


@web.post("/api/pick_files")
def api_pick_files():
    """Hộp thoại chọn file của macOS (dùng khi không chạy trong cửa sổ pywebview)."""
    if platform.system() != "Darwin":
        return err("Chỉ hỗ trợ trên macOS — hãy gõ đường dẫn.")
    multi = "with multiple selections allowed" if body().get("multiple") else ""
    script = (f'set fs to (choose file with prompt "Chọn file" {multi})\n'
              'if class of fs is not list then set fs to {fs}\n'
              'set out to ""\nrepeat with f in fs\nset out to out & POSIX path of f & linefeed\nend repeat\nreturn out')
    r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    return ok(paths=[l for l in r.stdout.splitlines() if l.strip()])


@web.post("/api/pick_folder")
def api_pick_folder():
    """Hộp thoại chọn folder của macOS (dùng khi không chạy trong cửa sổ pywebview)."""
    if platform.system() != "Darwin":
        return err("Chỉ hỗ trợ trên macOS — hãy gõ đường dẫn.")
    r = subprocess.run(["osascript", "-e", 'POSIX path of (choose folder with prompt "Chọn folder")'],
                       capture_output=True, text=True)
    path = r.stdout.strip().rstrip("/")
    return ok(path=path) if path else ok(path=None)


# ---------------------------------------------------------------- khởi động
def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class JsApi:
    """Hàm gọi được từ giao diện khi chạy trong cửa sổ pywebview."""
    window = None

    def pick_files(self, multiple=False):
        import webview
        r = self.window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=bool(multiple))
        return list(r) if r else []

    def pick_folder(self):
        import webview
        r = self.window.create_file_dialog(webview.FOLDER_DIALOG)
        return r[0] if r else None


def main():
    port = free_port()
    url = f"http://127.0.0.1:{port}/?t={TOKEN}"
    threading.Thread(target=lambda: web.run("127.0.0.1", port, threaded=True, use_reloader=False),
                     daemon=True).start()
    S.add_log(f"TeleUploader khởi động {datetime.now():%d/%m/%Y %H:%M}")
    try:
        run_tg(ensure_client(require_login=False), timeout=20)
    except Exception as e:  # noqa: BLE001
        S.add_log(str(e), "warn")
    try:
        import webview
    except ImportError:
        import webbrowser
        webbrowser.open(url)
        print(f"Mở giao diện: {url}  (Ctrl+C để thoát)")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            return
    api = JsApi()
    api.window = webview.create_window("elevaTO Media Hub", url, width=1180, height=780, min_size=(820, 560), js_api=api)
    webview.start()


if __name__ == "__main__":
    main()
