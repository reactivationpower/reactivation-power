"""Install approved conversational takes using measured character timestamps.

No audio speed changes. Each visual click follows its specific spoken cue;
short adjacent instructions get shorter cursor travel, never skipped clicks.
"""
import hashlib
import json
import math
import subprocess
import sys
from pathlib import Path

root = Path.cwd()
plan = json.loads((root / "scripts/tutorial-series/conversational-plan.json").read_text())
takes = json.loads((root / "scripts/tutorial-series/conversational-takes.json").read_text())
slug = sys.argv[1]
lesson = next(l for l in plan if l["slug"] == slug)
artifact = root / "artifacts" / slug
voice = {"voiceId": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah", "modelId": "eleven_v3",
         "voiceSettings": {"stability": .5, "similarity_boost": .75, "speed": .96}}
music = root / "artifacts/patient-pipeline-first-campaign/public/audio/music_bed.mp3"
inputs = ["-stream_loop", "-1", "-i", str(music)]
filters, channels, elapsed = [], ["[bed]"], 0
report = ["# Conversational narration: measured speech and visual cues", "",
          "Sarah, with the approved audition's voice settings. Original pacing preserved.",
          "Click times below come from the generated audio's character timestamps, not estimated chapter percentages.",
          "Each cue is its own anchor. Cursor travel can shorten between closely spaced instructions.", "",
          "| Chapter | Start | Speech | Total |", "|---|---:|---:|---:|"]
cue_report = []
for index, scene in enumerate(lesson["scenes"], 1):
    take = takes[scene["audioId"]]
    seconds = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                             "-of", "default=nw=1:nk=1", str(root / take["audio"])], text=True))
    alignment = json.loads((root / take["alignment"]).read_text())["alignment"]
    text = "".join(alignment["characters"]).lower()
    scene["voiceMs"] = round(seconds * 1000)
    scene["startMs"] = elapsed
    previous_click = -1000
    for action in scene["actions"]:
        position = text.find(action["cue"].lower())
        if position < 0:
            raise ValueError(f"Spoken cue not found: {slug}/{scene['key']}/{action['cue']}")
        spoken = round(alignment["character_start_times_seconds"][position] * 1000)
        click = 650 + spoken + 80
        if click <= previous_click:
            raise ValueError(f"Unordered spoken cues: {slug}/{scene['key']}/{action['cue']}")
        start = max(0, click - 1180, previous_click + 100)
        if start >= click:
            start = previous_click + 1
        action.update(startMs=start, clickDelayMs=click-start, cueMs=650+spoken)
        previous_click = click
    for i, action in enumerate(scene["actions"]):
        if action.get("typing"):
            click = action["startMs"] + action["clickDelayMs"]
            next_start = scene["actions"][i+1]["startMs"] if i+1 < len(scene["actions"]) else 650+scene["voiceMs"]
            available = max(400, next_start-click-250)
            action["typingMs"] = min(len(action["result"])*92, available)
    last_visual = max((a["startMs"]+a["clickDelayMs"]+220+a.get("typingMs",500)
                       for a in scene["actions"]), default=0)
    scene["durationMs"] = math.ceil(max(650+scene["voiceMs"]+1500, last_visual+1500)/500)*500
    report.append(f"| {scene['key']} | {elapsed/1000:.2f}s | {seconds:.2f}s | {scene['durationMs']/1000:.2f}s |")
    for action in scene["actions"]:
        cue_report.append(f"| {scene['key']} | {action['target']} | {action['cue']} | "
                          f"{(elapsed+action['cueMs'])/1000:.3f}s | "
                          f"{(elapsed+action['startMs']+action['clickDelayMs'])/1000:.3f}s |")
    inputs += ["-i", str(root / take["audio"])]
    filters.append(f"[{index}:a]loudnorm=I=-18:TP=-2:LRA=11,asetpts=PTS-STARTPTS,adelay={elapsed+650}:all=1[v{index}]")
    channels.append(f"[v{index}]")
    elapsed += scene["durationMs"]
lesson.update(durationMs=elapsed, voice=voice, illustrated=True, timingMethod="measured-character-cues")
audio_hash = hashlib.sha256(json.dumps([(s["audioId"], s["durationMs"]) for s in lesson["scenes"]]).encode()).hexdigest()[:12]
lesson["audioFile"] = f"tutorial-conversational-{audio_hash}.mp3"
duration = elapsed/1000
filters.insert(0, f"[0:a]atrim=duration={duration},asetpts=PTS-STARTPTS,volume=0.07,afade=t=in:d=1.2,afade=t=out:st={duration-2.5}:d=2.5[bed]")
filters.append("".join(channels)+f"amix=inputs={len(channels)}:duration=first:normalize=0,alimiter=limit=0.95:level=0[out]")
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *inputs, "-filter_complex", ";".join(filters),
                "-map", "[out]", "-t", str(duration), "-ar", "44100", "-c:a", "libmp3lame", "-q:a", "2",
                str(artifact / "public/audio" / lesson["audioFile"])], check=True)
# Install timeline only after its uniquely named audio exists.
(artifact / "src/components/video/lesson.json").write_text(json.dumps(lesson, indent=2)+"\n")
report += ["", f"Total: {duration:.2f}s. No time compression, silence stripping, or voice-speed change.", "",
           "| Chapter | Visual target | Spoken cue | Speech begins | Click |", "|---|---|---|---:|---:|", *cue_report]
(artifact / "TIMING.md").write_text("\n".join(report)+"\n")
script = (artifact / "CONVERSATIONAL-SCRIPT.md").read_text()
(artifact / "SCRIPT.md").write_text(script+"\n\n"+ "\n".join(report) + "\n")
print(f"{slug}: {duration:.2f}s; {len(cue_report)} independently aligned actions; {lesson['audioFile']}")