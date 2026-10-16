#!/usr/bin/env python3
"""Build the film timeline from the uncut narration takes, never the reverse."""
import json
import math
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
plan = json.loads((ROOT / "NARRATION.json").read_text())
takes = json.loads((ROOT / "narration-takes.json").read_text())
lead_in = 0.65
tail = 0.85
elapsed = 0
timing = {}
inputs = ["-stream_loop", "-1", "-i", str(ROOT / "public/audio/music_bed.mp3")]
filters = []
channels = ["[bed]"]
report = ["# Measured narration timeline", "", "The natural narration is not sped up, trimmed, or silence-stripped.",
          "0.65 seconds before each take; at least 0.85 seconds after it. Audio and scene lengths share this timeline.", "",
          "| Chapter | Start | Voice duration | Scene duration |", "|---|---:|---:|---:|"]
for index, scene in enumerate(plan["scenes"], 1):
    path = ROOT / takes[scene["key"]]
    duration = float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nk=1", str(path)
    ], text=True).strip())
    scene_duration = math.ceil((lead_in + duration + tail) * 2) / 2
    timing[scene["key"]] = {
        "startMs": round(elapsed * 1000),
        "durationMs": round(scene_duration * 1000),
        "voiceStartMs": round(lead_in * 1000),
        "voiceDurationMs": round(duration * 1000),
    }
    inputs += ["-i", str(path)]
    offset = round((elapsed + lead_in) * 1000)
    filters.append(f"[{index}:a]loudnorm=I=-18:TP=-2:LRA=11,asetpts=PTS-STARTPTS,adelay={offset}:all=1[v{index}]")
    channels.append(f"[v{index}]")
    report.append(f"| {scene['key']} | {elapsed:.2f}s | {duration:.2f}s | {scene_duration:.2f}s |")
    elapsed += scene_duration

filters.insert(0, f"[0:a]atrim=duration={elapsed},asetpts=PTS-STARTPTS,volume=0.07,afade=t=in:d=1.2,afade=t=out:st={elapsed-2.5}:d=2.5[bed]")
filters.append("".join(channels) + f"amix=inputs={len(channels)}:duration=first:normalize=0,alimiter=limit=0.95:level=0[out]")
subprocess.run([
    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *inputs,
    "-filter_complex", ";".join(filters), "-map", "[out]",
    "-t", str(elapsed), "-ar", "44100", "-c:a", "libmp3lame", "-q:a", "2",
    str(ROOT / "public/audio/composite_conversation_v1.mp3"),
], check=True)
(ROOT / "src/components/video/narration-timing.json").write_text(json.dumps(timing, indent=2) + "\n")
report += ["", f"Total: {elapsed:.2f}s ({int(elapsed//60)}:{elapsed%60:04.1f}).", "",
           "The mix keeps the natural sentence pauses inside each take. Music stays behind the normalized voice."]
(ROOT / "NARRATION_TIMING.md").write_text("\n".join(report) + "\n")
print("\n".join(report))