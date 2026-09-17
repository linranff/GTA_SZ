#!/usr/bin/env bash
# README media from the caption-free readme reel (src/readme-reel-shots.ts).
# 1. dev server on 5173        npm run dev
# 2. shoot 1080p60 takes        node scripts/record-trailer.mjs --reel=readme   (→ output/readme-reel/takes)
# 3. this script                scripts/encode-readme-media.sh                 (→ docs/media/readme)
# GIFs are only made for the two inline loops; dense aerial shots do not fit a GIF budget, so the
# grid uses JPG stills that link to compact 720p30 H.264 clips. All outputs are Git LFS.
set -euo pipefail
cd "$(dirname "$0")/.."
takes=output/readme-reel/takes out=docs/media/readme
mkdir -p "$out"
names=(r1:spring-bamboo-sunset r2:futian-axis-day r3:luohu-night r4:tencent-binhai-day r5:binhai-night-drive r6:lianhua-hill-sunset)
gifs=(r1 r5)
for pair in "${names[@]}"; do
  id=${pair%%:*} name=${pair#*:}
  ffmpeg -hide_banner -loglevel error -y -i "$takes/$id.mp4" -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -vf scale=1280:-2 -r 30 -movflags +faststart -an "$out/$name.mp4"
  ffmpeg -hide_banner -loglevel error -y -ss 3 -i "$takes/$id.mp4" -frames:v 1 -vf scale=1600:-2 -q:v 3 "$out/$name.jpg"
  for g in "${gifs[@]}"; do
    [[ $g == "$id" ]] || continue
    ffmpeg -hide_banner -loglevel error -y -i "$takes/$id.mp4" -vf "fps=12,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" -loop 0 "$out/$name.gif"
  done
done
du -h "$out"/* | sort -k2
