#!/usr/bin/env bash
# README trailer media from the hand-cut 30 s trailer (source lives outside the repo).
#   scripts/encode-readme-trailer.sh "/Users/fenglinran/Movies/30s GTA SZ.mov"
# Writes docs/media/readme/trailer-30s.mp4 (1080p30 H.264 + AAC, black tail trimmed),
# trailer-hero.gif (opening skyline → sunset aerials) and trailer-drive.gif (street driving with HUD).
# GIFs are 640 px / 12 fps so both inline loops stay under ~8 MB each. All outputs are Git LFS.
set -euo pipefail
cd "$(dirname "$0")/.."
src=${1:?source .mov/.mp4 required}
out=docs/media/readme
mkdir -p "$out"
# Source is 3406x1916 with ~71 s of black after 29.87 s; keep the visible part only.
end=29.8
gif_filter() { echo "fps=12,scale=640:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle"; }

ffmpeg -hide_banner -loglevel error -y -i "$src" -t "$end" -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -vf scale=1920:-2 -r 30 -c:a aac -b:a 128k -movflags +faststart "$out/trailer-30s.mp4"
ffmpeg -hide_banner -loglevel error -y -ss 0 -t 8 -i "$src" -vf "$(gif_filter)" -loop 0 "$out/trailer-hero.gif"
# Driving loop = night highway (6.8–9.8 s) spliced with the golden-hour street run (24.6–28.5 s); the
# frames between are UI/aerial shots and the title card starts at 28.6 s.
ffmpeg -hide_banner -loglevel error -y -i "$src" -filter_complex "[0:v]trim=6.8:9.8,setpts=PTS-STARTPTS[a];[0:v]trim=24.6:28.5,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0,$(gif_filter)" -loop 0 "$out/trailer-drive.gif"
du -h "$out"/trailer-*
