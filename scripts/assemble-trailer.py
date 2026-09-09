"""Assemble the 15 recorded engine takes into the delivery MP4, with original audio."""
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'output/trailer'
FFMPEG = '/opt/homebrew/bin/ffmpeg'
FFPROBE = '/opt/homebrew/bin/ffprobe'
FINAL = OUT / '深城纪-山海之间-1080p60.mp4'
durations = [8, 7, 8, 11, 7, 8, 6, 7, 6, 9, 8, 8, 11, 10, 6]
reports = []
for index, duration in enumerate(durations, 1):
    take = OUT / f'takes/{index:02d}.mp4'
    report = json.loads(take.with_suffix('.json').read_text())
    probe = json.loads(subprocess.check_output([
        FFPROBE, '-v', 'error', '-show_streams', '-of', 'json', str(take)]))
    video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
    assert video['width'] == 1920 and video['height'] == 1080
    assert video['avg_frame_rate'] == '60/1' and int(video['nb_frames']) == duration * 60
    assert abs(float(video['duration']) - duration) < .001
    reports.append(report)

# Relative names make the cut list portable with the output directory.
concat = OUT / 'edit.ffconcat'
concat.write_text('ffconcat version 1.0\n' + ''.join(
    f"file 'takes/{index:02d}.mp4'\n" for index in range(1, 16)))
metadata = OUT / 'chapters.ffmetadata'
lines = [';FFMETADATA1', 'title=深城纪 · 山海之间',
         'comment=In-engine cinematic capture; 1920x1080, 60 unique simulation frames per second.',
         'copyright=City data © OpenStreetMap contributors / ODbL; CarConcept © DGG / Eric Chadwick / CC BY 4.0; environment assets Poly Haven / CC0. Full credits accompany this film.']
elapsed = 0
for duration, report in zip(durations, reports):
    lines.extend(['[CHAPTER]', 'TIMEBASE=1/1000', f'START={elapsed * 1000}',
                  f'END={(elapsed + duration) * 1000}', f"title={report['title']}"])
    elapsed += duration
assert elapsed == 120
metadata.write_text('\n'.join(lines) + '\n')

analysis = (OUT / 'audio/loudness-pass1.log').read_text()
measurement = json.loads(re.findall(r'\{\s*"input_i".*?\}', analysis, re.S)[-1])
gain_db = -16 - float(measurement['input_i'])
assert float(measurement['input_tp']) + gain_db < -1.5, 'Static gain exceeds peak headroom'
command = [FFMPEG, '-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', str(concat),
           '-i', str(OUT / 'audio/mix.wav'), '-f', 'ffmetadata', '-i', str(metadata),
           '-map', '0:v:0', '-map', '1:a:0', '-map_metadata', '2', '-map_chapters', '2',
           '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-profile:v', 'high',
           '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-g', '120',
           '-color_range', 'tv', '-colorspace', 'bt709', '-color_trc', 'bt709',
           '-color_primaries', 'bt709', '-video_track_timescale', '60000',
           '-af', f'volume={gain_db:.3f}dB', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
           '-t', '120', '-movflags', '+faststart', str(FINAL)]
with (OUT / 'export.log').open('w') as log:
    result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
result.check_returncode()
probe = json.loads(subprocess.check_output([
    FFPROBE, '-v', 'error', '-show_streams', '-show_format', '-show_chapters', '-of', 'json', str(FINAL)]))
video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
audio = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
assert int(video['nb_frames']) == 7200 and video['avg_frame_rate'] == '60/1'
assert video['width'] == 1920 and video['height'] == 1080
assert abs(float(probe['format']['duration']) - 120) < .001
assert audio['sample_rate'] == '48000' and audio['channels'] == 2
(OUT / 'delivery-probe.json').write_text(json.dumps(probe, ensure_ascii=False, indent=2) + '\n')
(OUT / 'edit.json').write_text(json.dumps({
    'output': str(FINAL), 'frames': 7200, 'seconds': 120,
    'audioGainDb': gain_db, 'measuredSourceLoudness': measurement,
    'shots': [{'id': r['id'], 'title': r['title'], 'seconds': d} for r, d in zip(reports, durations)]
}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'output': str(FINAL), 'seconds': probe['format']['duration'],
                  'frames': video['nb_frames'], 'bytes': probe['format']['size']}, ensure_ascii=False))
