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


def _need_ffmpeg():
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise RuntimeError("Chưa cài ffmpeg. Mở Terminal chạy: brew install ffmpeg")


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


def probe(path: Path) -> dict:
    _need_ffmpeg()
    r = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"Không đọc được video: {path.name}")
    data = json.loads(r.stdout)
    v = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
    a = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), {})
    fps = v.get("r_frame_rate", "0/1").split("/")
    return {
        "duration": float(data.get("format", {}).get("duration") or 0),
        "size": int(data.get("format", {}).get("size") or path.stat().st_size),
        "vcodec": v.get("codec_name"), "acodec": a.get("codec_name"),
        "width": v.get("width"), "height": v.get("height"),
        "fps": round(float(fps[0]) / float(fps[1] or 1), 2) if len(fps) == 2 and float(fps[1] or 0) else None,
    }


def _run_ffmpeg(args: list[str], total_sec: float, progress, label: str):
    """Chạy ffmpeg, đọc tiến độ từ -progress để cập nhật thanh tiến độ."""
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-progress", "pipe:1", "-nostats", *args]
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
        codec = _encode_args() if precise else ["-map", "0", "-c", "copy"]
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
    """Dải ảnh thu nhỏ (count khung hình, ghép ngang) cho thanh timeline."""
    info = probe(path)
    dur = max(info["duration"], 0.1)
    fps = count / dur
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(path),
                    "-vf", f"fps={fps:.6f},scale=-2:{height},tile={count}x1", "-frames:v", "1", "-q:v", "5", str(out)],
                   check=True, capture_output=True)
    return out


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
            _run_ffmpeg(["-f", "concat", "-safe", "0", "-i", lst, "-map", "0", "-c", "copy",
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
    r = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True)
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
