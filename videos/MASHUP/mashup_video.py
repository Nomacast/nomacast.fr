#!/usr/bin/env python3
"""
Mashup Vidéo v4.1 — Qualité maximale + sélection variée
=========================================================

Chaque --seed produit un mashup COMPLÈTEMENT différent :
les segments sont choisis par tirage pondéré (les bons moments ont
plus de chances, mais chaque seed donne une sélection unique).

Usage:
    python mashup_video.py --input .
    python mashup_video.py --input . --seed 1
    python mashup_video.py --input . --seed 2   (extraits différents !)
    python mashup_video.py --input . --seed 3   (encore différents !)
    python mashup_video.py --input . --no-analyze --seed 5

Priorités (optionnel) — priorities.json dans le dossier d'input:
    {
        "keynote_client.mp4": "full",
        "concert_live.mov": 3
    }

Pré-requis: ffmpeg et ffprobe dans le PATH
"""

import argparse
import json
import os
import random
import subprocess
import sys
import tempfile
from pathlib import Path


# ── Configuration ─────────────────────────────────────────────────────

DUREE_TOTALE = 60
DUREE_CLIP = 2
TARGET_W = 1920
TARGET_H = 1080
FPS = 25
CRF = "16"
PRESET = "slow"
BITRATE_MAX = "30M"
EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".mxf", ".ts", ".m4v", ".webm"}

ANALYZE_W = 320
ANALYZE_H = 180
MIN_BRIGHTNESS = 8
MIN_DETAIL = 3
MIN_MOTION = 1
ANALYSIS_WINDOW = 2


def get_duration(filepath: str) -> float:
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        str(filepath)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return 0
    info = json.loads(result.stdout)
    return float(info["format"].get("duration", 0))


def get_video_props(filepath: str) -> dict:
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-select_streams", "v:0",
        str(filepath)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return {}
    info = json.loads(result.stdout)
    if info.get("streams"):
        s = info["streams"][0]
        fps = 0
        if s.get("r_frame_rate"):
            parts = s["r_frame_rate"].split("/")
            if len(parts) == 2 and int(parts[1]) > 0:
                fps = round(int(parts[0]) / int(parts[1]), 2)
        return {
            "codec": s.get("codec_name", ""),
            "width": s.get("width", 0),
            "height": s.get("height", 0),
            "pix_fmt": s.get("pix_fmt", ""),
            "fps": fps
        }
    return {}


# ── Analyse ───────────────────────────────────────────────────────────

def extract_gray_frame(filepath, timestamp):
    cmd = [
        "ffmpeg", "-v", "error",
        "-ss", str(timestamp),
        "-i", filepath,
        "-frames:v", "1",
        "-vf", f"scale={ANALYZE_W}:{ANALYZE_H}",
        "-pix_fmt", "gray",
        "-f", "rawvideo",
        "pipe:1"
    ]
    result = subprocess.run(cmd, capture_output=True)
    return result.stdout if result.returncode == 0 else b""


def compute_brightness(frame):
    return sum(frame) / len(frame) if frame else 0


def compute_detail(frame, width, height):
    if not frame or len(frame) < width * height:
        return 0
    total = count = 0
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            idx = y * width + x
            lap = (4 * frame[idx]
                   - frame[(y-1) * width + x]
                   - frame[(y+1) * width + x]
                   - frame[y * width + (x-1)]
                   - frame[y * width + (x+1)])
            total += abs(lap)
            count += 1
    return total / count if count else 0


def compute_motion(f1, f2):
    if not f1 or not f2:
        return 0
    length = min(len(f1), len(f2))
    return sum(abs(f1[i] - f2[i]) for i in range(length)) / length if length else 0


def is_good(seg):
    return (seg["brightness"] >= MIN_BRIGHTNESS
            and seg["detail"] >= MIN_DETAIL
            and seg["motion"] >= MIN_MOTION)


def score_segment(seg):
    d = min(seg["detail"] / 40, 1.0)
    m = min(seg["motion"] / 25, 1.0)
    if seg["motion"] > 50:
        m *= 0.5
    return d * 0.6 + m * 0.4


def analyze_video(filepath, duration, name, debug=False):
    usable = duration - 1.0
    if usable < ANALYSIS_WINDOW:
        return []
    nb = min(int(usable / ANALYSIS_WINDOW), 80)
    print(f"  🔍 {name} ({nb} points)...", end="" if not debug else "\n", flush=True)

    good, rejected = [], 0
    for i in range(nb):
        t = (i / nb) * usable
        f1 = extract_gray_frame(filepath, t)
        f2 = extract_gray_frame(filepath, t + 0.5)
        seg = {
            "start": round(t, 2),
            "brightness": round(compute_brightness(f1), 1),
            "detail": round(compute_detail(f1, ANALYZE_W, ANALYZE_H), 1),
            "motion": round(compute_motion(f1, f2), 1)
        }
        if debug:
            s = "✓" if is_good(seg) else "✗"
            print(f"    {s} @{t:7.1f}s  bright={seg['brightness']:6.1f}  "
                  f"detail={seg['detail']:6.1f}  motion={seg['motion']:5.1f}")
        if is_good(seg):
            seg["score"] = score_segment(seg)
            good.append(seg)
        else:
            rejected += 1

    if not debug:
        print(f" ✓ ({len(good)} bons / {rejected} rejetés)")
    else:
        print(f"  → {len(good)} bons / {rejected} rejetés")
    return good


# ── Sélection par tirage pondéré ──────────────────────────────────────

def weighted_pick(candidates, nb_picks, clip_dur):
    """
    Tire nb_picks segments parmi les candidats, pondéré par le score.
    Les segments proches (chevauchement) sont exclus au fur et à mesure.
    Chaque appel avec un random state différent donne des résultats différents.
    """
    if not candidates:
        return []

    available = list(candidates)
    picked = []
    picked_starts = []

    for _ in range(nb_picks):
        if not available:
            break

        # Pondération : score + bonus aléatoire pour diversifier
        weights = []
        for c in available:
            # Score de base (1-100) + composante aléatoire (0-50)
            w = max(c.get("score", 50), 1) + random.uniform(0, 50)
            weights.append(w)

        # Tirage pondéré
        total_w = sum(weights)
        r = random.uniform(0, total_w)
        cumul = 0
        chosen_idx = 0
        for idx, w in enumerate(weights):
            cumul += w
            if cumul >= r:
                chosen_idx = idx
                break

        chosen = available[chosen_idx]
        picked.append(chosen)
        picked_starts.append(chosen["start"])

        # Retirer les candidats trop proches du segment choisi
        available = [
            c for c in available
            if abs(c["start"] - chosen["start"]) >= clip_dur + 0.5
        ]

    return picked


def find_videos(input_dir):
    videos = []
    for f in sorted(Path(input_dir).iterdir()):
        if f.suffix.lower() in EXTENSIONS:
            dur = get_duration(str(f))
            if dur > 0:
                props = get_video_props(str(f))
                videos.append({
                    "path": str(f), "duration": dur, "name": f.name,
                    "width": props.get("width", 0),
                    "height": props.get("height", 0),
                    "codec": props.get("codec", ""),
                    "pix_fmt": props.get("pix_fmt", ""),
                    "fps": props.get("fps", 0)
                })
                res = f"{props.get('width', '?')}x{props.get('height', '?')}"
                print(f"  ✓ {f.name} ({dur:.1f}s, {res}, {props.get('codec', '?')})")
    return videos


def load_priorities(input_dir):
    prio_path = os.path.join(input_dir, "priorities.json")
    if os.path.exists(prio_path):
        try:
            with open(prio_path, encoding="utf-8") as f:
                content = f.read().strip()
                if not content:
                    print(f"\n⚠ priorities.json vide, ignoré")
                    return {}
                return json.loads(content)
        except json.JSONDecodeError as e:
            print(f"\n⚠ priorities.json mal formaté ({e}), ignoré")
    return {}


def select_segments(videos, duree_totale, clip_dur, priorities, do_analyze, debug):
    if not videos:
        return []

    segments = []
    full_videos, normal_videos = [], []

    for video in videos:
        prio = priorities.get(video["name"], 1)
        if prio == "full":
            full_videos.append(video)
        else:
            video["priority"] = int(prio) if isinstance(prio, (int, float)) else 1
            normal_videos.append(video)

    def pick_from_video(video, nb_clips, is_full=False):
        result = []
        if do_analyze:
            analysis = analyze_video(video["path"], video["duration"], video["name"], debug)
            if analysis:
                picked = weighted_pick(analysis, nb_clips, clip_dur)
                for pt in picked:
                    if pt["start"] + clip_dur > video["duration"] - 0.2:
                        continue
                    result.append({
                        "path": video["path"], "start": round(pt["start"], 2),
                        "duration": clip_dur, "name": video["name"],
                        "score": pt.get("score", 50), "is_full": is_full,
                        "src_w": video["width"], "src_h": video["height"]
                    })
                if result:
                    return result
            print(f"  ⚠ {video['name']}: fallback aléatoire")

        # Fallback : positions aléatoires
        usable = video["duration"] - clip_dur - 0.5
        if usable <= 0:
            return result
        count = nb_clips if not is_full else max(1, int(usable / (clip_dur + 1)))
        positions = sorted(random.sample(
            [round(t, 2) for t in
             [random.uniform(0, usable) for _ in range(count * 3)]],
            min(count, count * 3)
        ))
        # Dédoublonner les positions trop proches
        filtered = []
        for pos in positions:
            if not filtered or pos - filtered[-1] >= clip_dur + 0.5:
                filtered.append(pos)
        for pos in filtered[:count]:
            result.append({
                "path": video["path"], "start": pos,
                "duration": clip_dur, "name": video["name"],
                "score": 30, "is_full": is_full,
                "src_w": video["width"], "src_h": video["height"]
            })
        return result

    # Full videos
    duree_full = 0
    for v in full_videos:
        segs = pick_from_video(v, 999, is_full=True)
        duree_full += sum(s["duration"] for s in segs)
        segments.extend(segs)

    # Normal videos
    duree_restante = max(duree_totale - duree_full, duree_totale * 0.5)
    if normal_videos:
        nb_total = int(duree_restante / clip_dur)
        total_w = sum(v["priority"] for v in normal_videos)
        for v in normal_videos:
            nb = max(1, int(nb_total * v["priority"] / total_w))
            segments.extend(pick_from_video(v, nb))

    random.shuffle(segments)

    effective_total = max(duree_totale, duree_full + 10)
    final, dur = [], 0
    for seg in segments:
        if dur + seg["duration"] > effective_total + 2:
            break
        final.append(seg)
        dur += seg["duration"]
    return final


# ── Assemblage ────────────────────────────────────────────────────────

def build_mashup(segments, output_path, target_w, target_h, fps, crf, preset, bitrate_max):
    if not segments:
        print("Aucun segment à assembler.")
        return

    tmpdir = tempfile.mkdtemp(prefix="mashup_")

    needs_scale = any(
        s.get("src_w", 0) != target_w or s.get("src_h", 0) != target_h
        for s in segments
    )

    print(f"\n🎬 Extraction de {len(segments)} clips...")
    mode_label = "FFV1 lossless (rescale)" if needs_scale else "stream copy"
    print(f"   Mode: {mode_label}")

    clip_files = []
    for i, seg in enumerate(segments):
        clip_path = os.path.join(tmpdir, f"clip_{i:03d}.mkv")

        if needs_scale:
            cmd = [
                "ffmpeg", "-y", "-v", "warning",
                "-ss", str(seg["start"]),
                "-i", seg["path"],
                "-t", str(seg["duration"]),
                "-vf", (
                    f"scale={target_w}:{target_h}:"
                    f"force_original_aspect_ratio=decrease,"
                    f"pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:black,"
                    f"fps={fps}"
                ),
                "-an", "-c:v", "ffv1", "-pix_fmt", "yuv420p",
                clip_path
            ]
        else:
            cmd = [
                "ffmpeg", "-y", "-v", "warning",
                "-ss", str(seg["start"]),
                "-i", seg["path"],
                "-t", str(seg["duration"]),
                "-an", "-c:v", "copy",
                clip_path
            ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            clip_files.append(clip_path)
            score = f" [score: {seg['score']:.0f}]" if seg.get("score", 50) != 50 else ""
            full = " [FULL]" if seg.get("is_full") else ""
            print(f"  [{i+1}/{len(segments)}] {seg['name']} @ {seg['start']:.1f}s "
                  f"→ {seg['duration']}s{score}{full} ✓")
        else:
            print(f"  [{i+1}/{len(segments)}] ERREUR: {result.stderr[:300]}")

    if not clip_files:
        print("Aucun clip extrait.")
        return

    concat_file = os.path.join(tmpdir, "concat.txt")
    with open(concat_file, "w") as f:
        for clip in clip_files:
            safe = clip.replace("'", "'\\''")
            f.write(f"file '{safe}'\n")

    print(f"\n🔗 Encodage final (CRF {crf}, {preset})...")

    vf = f"fps={fps}" if not needs_scale else ""
    cmd = [
        "ffmpeg", "-y", "-v", "warning",
        "-f", "concat", "-safe", "0", "-i", concat_file,
    ]
    if vf:
        cmd += ["-vf", vf]
    cmd += [
        "-c:v", "libx264",
        "-preset", preset,
        "-crf", crf,
        "-maxrate", bitrate_max,
        "-bufsize", "60M",
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
        "-an",
        output_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    for clip in clip_files:
        try:
            os.remove(clip)
        except OSError:
            pass
    try:
        os.remove(concat_file)
        os.rmdir(tmpdir)
    except OSError:
        pass

    if result.returncode == 0:
        size_mb = os.path.getsize(output_path) / (1024 * 1024)
        dur = get_duration(output_path)
        print(f"\n✅ Mashup créé: {output_path}")
        print(f"   Durée: {dur:.1f}s | Taille: {size_mb:.1f} Mo")
    else:
        print(f"\n❌ Erreur: {result.stderr}")


def main():
    parser = argparse.ArgumentParser(description="Mashup vidéo showreel v4.1")
    parser.add_argument("--input", "-i", default="./videos")
    parser.add_argument("--output", "-o", default="mashup.mp4")
    parser.add_argument("--duree-totale", type=float, default=DUREE_TOTALE)
    parser.add_argument("--duree-clip", type=float, default=DUREE_CLIP)
    parser.add_argument("--resolution", default=f"{TARGET_W}:{TARGET_H}")
    parser.add_argument("--fps", type=int, default=FPS)
    parser.add_argument("--crf", default=CRF)
    parser.add_argument("--preset", default=PRESET)
    parser.add_argument("--bitrate-max", default=BITRATE_MAX)
    parser.add_argument("--no-analyze", action="store_true")
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--seed", type=int, default=None)

    args = parser.parse_args()
    if args.seed is not None:
        random.seed(args.seed)

    parts = args.resolution.split(":")
    target_w = int(parts[0]) if len(parts) == 2 else TARGET_W
    target_h = int(parts[1]) if len(parts) == 2 else TARGET_H

    print("╔══════════════════════════════════════════╗")
    print("║     🎬  Mashup Vidéo Generator v4.1      ║")
    print("╚══════════════════════════════════════════╝\n")
    print(f"📂 Dossier: {args.input}")
    print(f"   Durée: {args.duree_totale}s | Clip: {args.duree_clip}s")
    print(f"   Sortie: {target_w}x{target_h} @ {args.fps}fps")
    print(f"   Qualité: CRF {args.crf} / {args.preset}")
    print(f"   Analyse: {'✓' if not args.no_analyze else '✗'}")
    seed_str = f"   Seed: {args.seed}" if args.seed else "   Seed: aléatoire"
    print(seed_str)
    print()

    if not os.path.isdir(args.input):
        print(f"❌ Le dossier '{args.input}' n'existe pas.")
        sys.exit(1)

    videos = find_videos(args.input)
    if not videos:
        print(f"\n❌ Aucune vidéo trouvée")
        sys.exit(1)

    priorities = load_priorities(args.input)
    if priorities:
        print(f"\n📋 Priorités:")
        for name, prio in priorities.items():
            label = "intégrale" if prio == "full" else f"x{prio}"
            print(f"   {name} → {label}")

    print(f"\n📊 {len(videos)} vidéo(s)")

    segments = select_segments(
        videos, args.duree_totale, args.duree_clip,
        priorities, not args.no_analyze, args.debug
    )

    duree = sum(s["duration"] for s in segments)
    print(f"   {len(segments)} segments ({duree:.1f}s)")

    build_mashup(segments, args.output, target_w, target_h,
                 args.fps, args.crf, args.preset, args.bitrate_max)


if __name__ == "__main__":
    main()
