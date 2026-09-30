#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
audio=public/audio
# Keep this order and these millisecond offsets in sync with SCENE_DURATIONS
# in VideoTemplate.tsx. Each scene narration starts 750 ms after its cut.
files=(
  music_bed.mp3
  vo_01.mp3 vo_01_connection.mp3
  vo_02.mp3 vo_03.mp3 vo_04.mp3 vo_05.mp3 vo_06.mp3
  vo_07.mp3 vo_08.mp3 vo_09.mp3 vo_10.mp3 vo_11.mp3
)
offsets=(750 15650 20750 41750 63250 97250 124250 153750 209250 254750 273250 298750)
inputs=()
for file in "${files[@]}"; do inputs+=(-i "$audio/$file"); done

filter='[0:a]atrim=duration=324,asetpts=PTS-STARTPTS,volume=0.11[bed];'
mix='[bed]'
for i in "${!offsets[@]}"; do
  track=$((i + 1))
  filter+="[$track:a]asetpts=PTS-STARTPTS,adelay=${offsets[i]}:all=1[v$track];"
  mix+="[v$track]"
done
filter+="${mix}amix=inputs=13:duration=first:normalize=0,alimiter=limit=0.95[out]"
ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" -filter_complex "$filter" \
  -map '[out]' -t 324 -c:a libmp3lame -q:a 3 "$audio/composite_audio_tightened_v2.mp3"