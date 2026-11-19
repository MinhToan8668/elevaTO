"""Cắt / gộp video (ffmpeg, không nén lại → nhanh, giữ nguyên chất lượng) và chia / ghép file bất kỳ.

Mọi hàm nhận `progress(done, total, label)` để báo tiến độ (giao diện app dùng thanh tiến độ).
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

MiB = 1024 * 1024
PART_RE = re.compile(r"^(?P<base>.+)\.part(?P<n>\d{3})$")


def _noop(done, total, label=""):
    pass


_ENGINES: list[str] | None = None   # các bản ffmpeg tìm được, bản đang dùng đứng đầu


def engines(refresh: bool = False) -> list[str]:
    """Mọi bản ffmpeg có trên máy: Homebrew → trong PATH → bản kèm app (imageio-ffmpeg) → bản tự tải (static-ffmpeg).
    Mỗi bản đọc được các loại file hơi khác nhau, nên file nào bản này chê thì thử bản kế."""
    global _ENGINES
    if _ENGINES is not None and not refresh:
        return _ENGINES
    found = [str(Path(d) / "ffmpeg") for d in ("/opt/homebrew/bin", "/usr/local/bin")]
    found.append(shutil.which("ffmpeg") or "")
    try:
        import imageio_ffmpeg
        found.append(imageio_ffmpeg.get_ffmpeg_exe())
    except Exception:  # noqa: BLE001 — chưa cài / không có bản cho máy này
        pass
    try:
        from static_ffmpeg import run as _sf
        found.append(str(Path(_sf.get_or_fetch_platform_executables_else_raise()[0])))
    except Exception:  # noqa: BLE001 — chưa tải được
        pass
    out = []
    for f in found:
        if f and os.path.isfile(f) and os.access(f, os.X_OK) and os.path.realpath(f) not in [os.path.realpath(o) for o in out]:
            out.append(f)
    _ENGINES = out
    return out


def _ff() -> str:
    e = engines() or engines(refresh=True)
    if not e:
        raise RuntimeError("Chưa có ffmpeg — app đang tải hoặc tải chưa được. Đợi thông báo tải xong, hoặc mở lại app khi có mạng.")
    return e[0]


def _prefer(exe: str) -> None:
    """Bản vừa đọc được file → dùng nó cho các bước cắt/gộp tiếp theo."""
    e = engines()
    if exe in e and e[0] != exe:
        e.remove(exe)
        e.insert(0, exe)


def _ffprobe_of(exe: str) -> str | None:
    cand = Path(exe).with_name("ffprobe")
    return str(cand) if cand.is_file() else None


def _unique(p: Path) -> Path:
    out, i = p, 1
    while out.exists():
        out = p.with_name(f"{p.stem} ({i}){p.suffix}")
        i += 1
    return out


def parse_time(s: str) -> float:
    """'90' | '1:30' | '01:02:03.5' → giây."""
    s = s.strip().replace(",", ".")
    if not s:
        raise ValueError("Thời gian trống")
    sec = 0.0
    for part in s.split(":"):
        sec = sec * 60 + float(part)
    return sec


def fmt_time(sec: float) -> str:
    sec = max(0.0, sec)
    h, rem = divmod(int(sec), 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


PERM_HELP = ("macOS chưa cho app quyền đọc chỗ này. Mở System Settings → Privacy & Security → Full Disk Access "
             "(hoặc Files and Folders) → bật cho Media Hub / Python / Terminal, rồi mở lại app.")


def check_readable(path: Path) -> None:
    """Báo rõ lý do khi không mở được file (không tồn tại / macOS chặn quyền)."""
    if not path.exists():
        raise RuntimeError(f"Không thấy file: {path}")
    try:
        with open(path, "rb") as f:
            f.read(16)
    except PermissionError as e:
        raise RuntimeError(f"Không được phép đọc {path.name}. {PERM_HELP}") from e
    except OSError as e:
        raise RuntimeError(f"Không mở được {path.name}: {e.strerror or e}") from e


def probe(path: Path) -> dict:
    path = Path(path)
    _ff()
    check_readable(path)
    reasons = []
    for exe in list(engines()):
        try:
            info = _probe_with(exe, path)
        except OSError as e:
            reasons.append(f"không chạy được {exe} ({e.strerror or e})")
            continue
        if isinstance(info, dict):
            _prefer(exe)
            return info
        reasons.append(info)
    why = next((r for r in reasons if r), "file hỏng hoặc không phải video")
    if "permitted" in why or "denied" in why:
        why = PERM_HELP
    tried = f" (đã thử {len(reasons)} bản ffmpeg)" if len(reasons) > 1 else ""
    raise RuntimeError(f"Không đọc được video {path.name}{tried}: {why}")


def _probe_with(exe: str, path: Path):
    """Trả dict thông tin, hoặc chuỗi lý do nếu bản ffmpeg này không đọc được file."""
    fp = _ffprobe_of(exe)
    if fp:
        r = subprocess.run([fp, "-v", "warning", "-print_format", "json", "-show_format", "-show_streams", str(path)],
                           capture_output=True, text=True, errors="replace")
        if r.returncode == 0:
            data = json.loads(r.stdout)
            v = next((x for x in data.get("streams", []) if x.get("codec_type") == "video"), {})
            a = next((x for x in data.get("streams", []) if x.get("codec_type") == "audio"), {})
            fps = v.get("r_frame_rate", "0/1").split("/")
            return {
                "duration": float(data.get("format", {}).get("duration") or 0),
                "size": int(data.get("format", {}).get("size") or path.stat().st_size),
                "vcodec": v.get("codec_name"), "acodec": a.get("codec_name"),
                "width": v.get("width"), "height": v.get("height"),
                "fps": round(float(fps[0]) / float(fps[1] or 1), 2) if len(fps) == 2 and float(fps[1] or 0) else None,
            }
    # Không có ffprobe (bản kèm app) hoặc ffprobe chê file → đọc thông tin từ chính ffmpeg
    r = subprocess.run([exe, "-hide_banner", "-i", str(path)], capture_output=True, text=True, errors="replace")
    err = r.stderr
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", err)
    vs_ = re.search(r"Stream #.*?Video:\s*(\w+).*?[ ,](\d{2,5})x(\d{2,5})", err)
    if not m or not vs_:
        if r.returncode < 0:
            return f"ffmpeg bị hệ thống dừng (tín hiệu {-r.returncode})"
        lines = [l.strip() for l in err.splitlines() if l.strip()]
        # dòng "… is not implemented" nói rõ thiếu tính năng gì, hữu ích hơn dòng lỗi cuối
        detail = next((l for l in lines if "not implemented" in l or "nsupported" in l), "")
        last = lines[-1] if lines else ""
        return (re.sub(r"^\[[^\]]*\]\s*", "", detail) + " — " if detail else "") + last[-200:]
    as_ = re.search(r"Stream #.*?Audio:\s*(\w+)", err)
    fps = re.search(r"([\d.]+)\s*fps", err[vs_.start():])
    return {
        "duration": int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]), "size": path.stat().st_size,
        "vcodec": vs_[1], "acodec": as_[1] if as_ else None, "width": int(vs_[2]), "height": int(vs_[3]),
        "fps": round(float(fps[1]), 2) if fps else None,
    }


def _run_ffmpeg(args: list[str], total_sec: float, progress, label: str):
    """Chạy ffmpeg, đọc tiến độ từ -progress để cập nhật thanh tiến độ."""
    cmd = [_ff(), "-hide_banner", "-loglevel", "error", "-y", "-progress", "pipe:1", "-nostats", *args]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    for line in proc.stdout:
        if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
            try:
                progress(min(total_sec, int(line.split("=")[1]) / 1e6), total_sec, label)
            except ValueError:
                pass
    err = proc.stderr.read()
    if proc.wait() != 0:
        raise RuntimeError(err.strip().splitlines()[-1] if err.strip() else "ffmpeg lỗi")
    progress(total_sec, total_sec, label)


# ---------------------------------------------------------------- cắt video
def split_video(path: Path, mode: str, value: str, out_dir: Path | None = None, progress=_noop,
                precise: bool = False, join: bool = False) -> list[Path]:
    """mode: 'duration' (value = phút mỗi đoạn), 'size' (value = MB mỗi đoạn),
             'ranges' (value = mỗi dòng 'bắt đầu - kết thúc', vd '0:10 - 1:25').
    precise: nén lại để cắt đúng từng khung hình (chậm hơn); mặc định cắt nhanh theo keyframe.
    join:    gộp các đoạn đã cắt thành 1 file (vd bỏ đoạn quay hỏng ở giữa)."""
    path = Path(path)
    info = probe(path)
    dur = info["duration"]
    if dur <= 0:
        raise RuntimeError("Không xác định được độ dài video.")
    out_dir = Path(out_dir) if out_dir else path.parent / f"{path.stem}_cat"
    out_dir.mkdir(parents=True, exist_ok=True)

    if mode == "ranges":
        ranges = []
        for line in str(value).splitlines():
            if not line.strip():
                continue
            a, _, b = line.replace("–", "-").partition("-")
            start, end = parse_time(a), (parse_time(b) if b.strip() else dur)
            if not 0 <= start < end:
                raise ValueError(f"Khoảng không hợp lệ: {line.strip()}")
            ranges.append((start, min(end, dur)))
    else:
        if mode == "duration":
            step = float(value) * 60
        elif mode == "size":
            # ước lượng theo bitrate trung bình, chừa 3% cho chắc không vượt
            step = dur * (float(value) * MiB) / info["size"] * 0.97
        else:
            raise ValueError("Chế độ cắt không hợp lệ")
        if step <= 1:
            raise ValueError("Đoạn quá ngắn.")
        ranges, t = [], 0.0
        while t < dur - 0.5:
            ranges.append((t, min(t + step, dur)))
            t += step

    outs = []
    total = sum(b - a for a, b in ranges)
    done_before = 0.0
    for i, (a, b) in enumerate(ranges, 1):
        out = _unique(out_dir / f"{path.stem}_{i:02d}{path.suffix.lower()}")
        label = f"Cắt {path.name} ({i}/{len(ranges)})"
        # -ss trước -i: tua nhanh; cắt không nén lại nên điểm cắt rơi vào keyframe gần nhất
        # Sony/DJI/GoPro ghi kèm luồng dữ liệu (rtmd, djmd, gpmd…) mà mp4 không chép được → chỉ lấy hình + tiếng
        codec = _encode_args() if precise else ["-map", "0:v", "-map", "0:a?", "-c", "copy"]
        if precise:
            out = out.with_suffix(".mp4")
        _run_ffmpeg(["-ss", f"{a:.3f}", "-i", str(path), "-t", f"{b - a:.3f}", *codec,
                     "-avoid_negative_ts", "make_zero", str(out)],
                    b - a, lambda d, _t, l, base=done_before: progress(base + d, total, l), label)
        done_before += b - a
        outs.append(out)
    if join and len(outs) > 1:
        merged = merge_videos(outs, out_dir / f"{path.stem}_da_cat{outs[0].suffix}", progress=progress)
        for o in outs:
            o.unlink(missing_ok=True)
        return [merged]
    return outs


def _encode_args() -> list[str]:
    v = ["-c:v", "h264_videotoolbox", "-b:v", "12M"] if _has_encoder("h264_videotoolbox") else \
        ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]
    return ["-map", "0:v:0", "-map", "0:a?", *v, "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart"]


def thumbnails(path: Path, out: Path, count: int = 12, height: int = 72) -> Path:
    """Dải ảnh thu nhỏ (count khung hình, ghép ngang) cho thanh timeline.
    Tua thẳng tới từng mốc (-ss trước -i) thay vì giải mã cả video → video dài 1–2 giờ vẫn ra trong vài giây."""
    dur = max(probe(path)["duration"], 0.1)
    with tempfile.TemporaryDirectory() as tmp:
        frames = []
        for i in range(count):
            t = dur * (i + 0.5) / count
            f = Path(tmp) / f"f{i:03d}.jpg"
            subprocess.run([_ff(), "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{t:.3f}", "-i", str(path),
                            "-frames:v", "1", "-vf", f"scale=-2:{height}", "-q:v", "5", str(f)], capture_output=True)
            if f.exists():
                frames.append(f)
            elif frames:  # mốc không lấy được khung hình (cuối file…) → dùng lại khung trước
                shutil.copy(frames[-1], f)
                frames.append(f)
        if not frames:
            raise RuntimeError("Không tạo được ảnh thu nhỏ")
        while len(frames) < count:
            extra = Path(tmp) / f"f{len(frames):03d}.jpg"
            shutil.copy(frames[-1], extra)
            frames.append(extra)
        subprocess.run([_ff(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(Path(tmp) / "f%03d.jpg"),
                        "-vf", f"tile={count}x1", "-frames:v", "1", "-q:v", "5", str(out)], check=True, capture_output=True)
    return out


def media_tags(path: Path) -> dict:
    """Các thẻ metadata (creation_time, com.apple.quicktime.creationdate…) của video/âm thanh.
    Dùng ffprobe nếu có, không thì đọc từ thông tin `ffmpeg -i` — chạy được với mọi bản ffmpeg của app."""
    for exe in list(engines()):
        fp = _ffprobe_of(exe)
        try:
            if fp:
                r = subprocess.run([fp, "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(path)],
                                   capture_output=True, text=True, errors="replace", timeout=60)
                if r.returncode == 0:
                    data = json.loads(r.stdout or "{}")
                    tags = dict((data.get("format") or {}).get("tags") or {})
                    for st in data.get("streams") or []:
                        tags.update({k: v for k, v in (st.get("tags") or {}).items() if k not in tags})
                    return tags
            r = subprocess.run([exe, "-hide_banner", "-i", str(path)], capture_output=True, text=True,
                               errors="replace", timeout=60)
            if "Duration:" in r.stderr:
                tags = {}
                for line in r.stderr.splitlines():
                    m = re.match(r"\s+([\w.:-]+)\s*:\s*(.+)$", line)
                    if m and m[1] not in tags:
                        tags[m[1]] = m[2].strip()
                return tags
        except (OSError, subprocess.SubprocessError, ValueError):
            continue
    return {}


def make_preview(path: Path, out: Path, progress=_noop) -> Path:
    """Bản xem trước nhẹ (H.264 540p) cho định dạng trình phát không đọc được (mkv, avi, mts…)."""
    dur = probe(path)["duration"]
    _run_ffmpeg(["-i", str(path), "-map", "0:v:0", "-map", "0:a?", "-vf", "scale=-2:540", "-c:v", "libx264",
                 "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
                 "-movflags", "+faststart", str(out)], dur, progress, f"Tạo bản xem trước {path.name}")
    return out


# ---------------------------------------------------------------- gộp video
def merge_videos(paths: list[Path], out: Path | None = None, reencode: bool = False, progress=_noop) -> Path:
    paths = [Path(p) for p in paths]
    if len(paths) < 2:
        raise ValueError("Chọn ít nhất 2 video để gộp.")
    infos = [probe(p) for p in paths]
    total = sum(i["duration"] for i in infos)
    first = paths[0]
    out = _unique(Path(out) if out else first.with_name(f"{first.stem}_gop{first.suffix.lower()}"))

    if not reencode:
        keys = {(i["vcodec"], i["acodec"], i["width"], i["height"]) for i in infos}
        if len(keys) > 1:
            raise RuntimeError("Các video khác định dạng/độ phân giải nên không gộp nhanh được — "
                               "bật 'Chuyển đổi cho khớp' (chậm hơn, có nén lại).")
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
            for p in paths:
                f.write("file '" + str(p).replace("'", "'\\''") + "'\n")
            lst = f.name
        try:
            _run_ffmpeg(["-f", "concat", "-safe", "0", "-i", lst, "-map", "0:v", "-map", "0:a?", "-c", "copy",
                         "-movflags", "+faststart", str(out)], total, progress, f"Gộp {len(paths)} video")
        finally:
            os.unlink(lst)
        return out

    # Nén lại cho khớp: đưa mọi video về độ phân giải của video đầu, 30fps, H.264/AAC
    w, h = infos[0]["width"] or 1920, infos[0]["height"] or 1080
    args, filt = [], []
    for i, p in enumerate(paths):
        args += ["-i", str(p)]
        filt.append(f"[{i}:v]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,"
                    f"setsar=1,fps=30,format=yuv420p[v{i}]")
        if infos[i]["acodec"]:
            filt.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo[a{i}]")
        else:  # video không có tiếng: chèn khoảng lặng cho đủ độ dài
            filt.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={infos[i]['duration']:.3f}[a{i}]")
    filt.append("".join(f"[v{i}][a{i}]" for i in range(len(paths))) + f"concat=n={len(paths)}:v=1:a=1[v][a]")
    enc = ["-c:v", "h264_videotoolbox", "-b:v", "12M"] if _has_encoder("h264_videotoolbox") else \
          ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]
    _run_ffmpeg([*args, "-filter_complex", ";".join(filt), "-map", "[v]", "-map", "[a]", *enc,
                 "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out.with_suffix(".mp4"))],
                total, progress, f"Gộp + chuyển đổi {len(paths)} video")
    return out.with_suffix(".mp4")


def _has_encoder(name: str) -> bool:
    r = subprocess.run([_ff(), "-hide_banner", "-encoders"], capture_output=True, text=True)
    return name in r.stdout


# ---------------------------------------------------------------- chia / ghép file bất kỳ
def split_file(path: Path, part_mb: float, out_dir: Path | None = None, progress=_noop) -> list[Path]:
    path = Path(path)
    size = path.stat().st_size
    part = int(float(part_mb) * MiB)
    if part < MiB:
        raise ValueError("Mỗi phần tối thiểu 1 MB.")
    n = -(-size // part)
    if n < 2:
        raise ValueError(f"File chỉ {size / MiB:.0f} MB, không cần chia.")
    out_dir = Path(out_dir) if out_dir else path.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(out_dir).free < size + 256 * MiB:
        raise RuntimeError("Ổ đĩa không đủ chỗ trống để chia file.")
    outs, done = [], 0
    with open(path, "rb") as src:
        for i in range(1, n + 1):
            out = out_dir / f"{path.name}.part{i:03d}"
            left = min(part, size - done)
            with open(out, "wb") as dst:
                while left:
                    chunk = src.read(min(8 * MiB, left))
                    dst.write(chunk)
                    left -= len(chunk)
                    done += len(chunk)
                    progress(done, size, f"Chia {path.name} ({i}/{n})")
            outs.append(out)
    return outs


def find_parts(any_part: Path) -> list[Path]:
    """Từ 1 phần bất kỳ (abc.mp4.part002) → tất cả các phần theo thứ tự."""
    m = PART_RE.match(Path(any_part).name)
    if not m:
        raise ValueError("Chọn file có đuôi .part001, .part002…")
    parts = sorted(Path(any_part).parent.glob(f"{glob_escape(m['base'])}.part[0-9][0-9][0-9]"))
    nums = [int(PART_RE.match(p.name)["n"]) for p in parts]
    missing = sorted(set(range(1, max(nums) + 1)) - set(nums))
    if missing:
        raise RuntimeError("Thiếu phần: " + ", ".join(f"part{x:03d}" for x in missing))
    return parts


def glob_escape(s: str) -> str:
    return re.sub(r"([*?\[])", r"[\1]", s)


def join_files(paths: list[Path], out: Path | None = None, progress=_noop) -> Path:
    paths = [Path(p) for p in paths]
    if len(paths) == 1:
        paths = find_parts(paths[0])
    if len(paths) < 2:
        raise ValueError("Cần ít nhất 2 phần để ghép.")
    m = PART_RE.match(paths[0].name)
    out = _unique(Path(out) if out else paths[0].parent / (m["base"] if m else paths[0].stem + "_ghep" + paths[0].suffix))
    total = sum(p.stat().st_size for p in paths)
    if shutil.disk_usage(out.parent).free < total + 256 * MiB:
        raise RuntimeError("Ổ đĩa không đủ chỗ trống để ghép file.")
    done = 0
    with open(out, "wb") as dst:
        for i, p in enumerate(paths, 1):
            with open(p, "rb") as src:
                while chunk := src.read(8 * MiB):
                    dst.write(chunk)
                    done += len(chunk)
                    progress(done, total, f"Ghép {out.name} ({i}/{len(paths)})")
    return out
