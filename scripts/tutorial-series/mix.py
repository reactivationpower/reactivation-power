"""Measure original narration files, preserve takes, and mix the approved music bed."""
import json, math, subprocess, sys
from pathlib import Path

root = Path.cwd()
slug = sys.argv[1]
artifact = root / "artifacts" / slug
config = artifact / "src/components/video/lesson.json"
lesson = json.loads(config.read_text())
takes = json.loads((root / "scripts/tutorial-series/takes.json").read_text())
music = root / "artifacts/patient-pipeline-first-campaign/public/audio/music_bed.mp3"
inputs = ["-stream_loop", "-1", "-i", str(music)]
filters, channels, elapsed = [], ["[bed]"], 0
report = ["# Measured, uncompressed narration", "", "| Chapter | Start | Speech | Total |", "|---|---:|---:|---:|"]
for i, scene in enumerate(lesson["scenes"], 1):
    take = root / takes[scene["audioId"]]
    seconds = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(take)], text=True).strip())
    scene["voiceMs"] = round(seconds * 1000)
    scene["durationMs"] = math.ceil((seconds + .65 + 1.5) * 2) * 500
    scene["startMs"] = round(elapsed * 1000)
    inputs += ["-i", str(take)]
    filters.append(f"[{i}:a]loudnorm=I=-18:TP=-2:LRA=11,asetpts=PTS-STARTPTS,adelay={round((elapsed+.65)*1000)}:all=1[v{i}]")
    channels.append(f"[v{i}]")
    report.append(f"| {scene['key']} | {elapsed:.2f}s | {seconds:.2f}s | {scene['durationMs']/1000:.2f}s |")
    elapsed += scene["durationMs"] / 1000
lesson["durationMs"] = round(elapsed * 1000)
filters.insert(0, f"[0:a]atrim=duration={elapsed},asetpts=PTS-STARTPTS,volume=0.07,afade=t=in:d=1.2,afade=t=out:st={elapsed-2.5}:d=2.5[bed]")
filters.append("".join(channels) + f"amix=inputs={len(channels)}:duration=first:normalize=0,alimiter=limit=0.95:level=0[out]")
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *inputs, "-filter_complex", ";".join(filters), "-map", "[out]", "-t", str(elapsed), "-ar", "44100", "-c:a", "libmp3lame", "-q:a", "2", str(artifact / "public/audio/tutorial-mix.mp3")], check=True)
config.write_text(json.dumps(lesson, indent=2) + "\n")
report += ["", f"Total: {elapsed:.2f}s. Sarah, eleven_v3, speed 0.96. No time compression or silence stripping.",
           "0.65s lead-in and at least 1.5s checkpoint hold per chapter; the original approved music bed at volume 0.07."]
(artifact / "TIMING.md").write_text("\n".join(report) + "\n")
print("\n".join(report))