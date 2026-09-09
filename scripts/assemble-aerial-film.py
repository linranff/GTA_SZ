"""Assemble eight new city flyovers, retaining their baked-in observer HUD."""
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'output/aerial-film'
FFMPEG = '/opt/homebrew/bin/ffmpeg'
FFPROBE = '/opt/homebrew/bin/ffprobe'
FINAL = OUT / '深城纪-天际之上-1080p60-HUD.mp4'
MUTE = OUT / '深城纪-天际之上-无配乐素材-HUD.mp4'
DURATIONS = [16, 16, 14, 14, 16, 16, 14, 14]


def run(command, log):
    with (OUT / log).open('w') as handle:
        subprocess.run(command, stdout=handle, stderr=subprocess.STDOUT, check=True)


def probe(path):
    return json.loads(subprocess.check_output([
        FFPROBE, '-v', 'error', '-show_streams', '-show_format', '-show_chapters',
        '-of', 'json', str(path)]))


reports = []
for index, seconds in enumerate(DURATIONS, 1):
    take = OUT / f'takes/{index:02d}.mp4'
    report = json.loads(take.with_suffix('.json').read_text())
    video = next(s for s in probe(take)['streams'] if s['codec_type'] == 'video')
    assert (video['width'], video['height']) == (1920, 1080)
    assert video['avg_frame_rate'] == '60/1'
    assert int(video['nb_frames']) == seconds * 60
    assert abs(float(video['duration']) - seconds) < .001
    assert report['selected']['resolution'] == [2560, 1440]
    reports.append(report)

concat = OUT / 'edit.ffconcat'
concat.write_text('ffconcat version 1.0\n' + ''.join(
    f"file 'takes/{index:02d}.mp4'\n" for index in range(1, 9)))
metadata = OUT / 'chapters.ffmetadata'
lines = [';FFMETADATA1', 'title=深城纪 · 天际之上',
         'comment=In-engine aerial capture with observer HUD. Fixed 1/60-second simulation. 2560x1440 render downsampled to 1920x1080.',
         'copyright=City data © OpenStreetMap contributors / ODbL. Full asset credits accompany this film.']
elapsed = 0
for duration, report in zip(DURATIONS, reports):
    lines.extend(['[CHAPTER]', 'TIMEBASE=1/1000', f'START={elapsed * 1000}',
                  f'END={(elapsed + duration) * 1000}', f"title={report['title']}"])
    elapsed += duration
assert elapsed == 120
metadata.write_text('\n'.join(lines) + '\n')

analysis = (OUT / 'audio/loudness-pass1.log').read_text()
measurement = json.loads(re.findall(r'\{\s*"input_i".*?\}', analysis, re.S)[-1])
normalization = (
    'loudnorm=I=-16:TP=-1.5:LRA=11:linear=false:print_format=json'
    f":measured_I={measurement['input_i']}:measured_TP={measurement['input_tp']}"
    f":measured_LRA={measurement['input_lra']}:measured_thresh={measurement['input_thresh']}"
    f":offset={measurement['target_offset']}"
)
master_audio = OUT / 'audio/master.wav'
run([FFMPEG, '-hide_banner', '-y', '-i', str(OUT / 'audio/mix.wav'),
     '-af', normalization, '-ar', '48000', '-c:a', 'pcm_s24le', str(master_audio)],
    'audio/loudness-pass2.log')
run([FFMPEG, '-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', str(concat),
     '-i', str(master_audio), '-f', 'ffmetadata', '-i', str(metadata),
     '-map', '0:v:0', '-map', '1:a:0', '-map_metadata', '2', '-map_chapters', '2',
     '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-profile:v', 'high',
     '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-g', '120',
     '-color_range', 'tv', '-colorspace', 'bt709', '-color_trc', 'bt709',
     '-color_primaries', 'bt709', '-video_track_timescale', '60000',
     '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-t', '120',
     '-movflags', '+faststart', str(FINAL)], 'export.log')
run([FFMPEG, '-hide_banner', '-y', '-i', str(FINAL), '-map', '0:v:0',
     '-map_metadata', '0', '-map_chapters', '0', '-c:v', 'copy', '-an',
     '-movflags', '+faststart', str(MUTE)], 'export-silent.log')

delivery = probe(FINAL)
video = next(s for s in delivery['streams'] if s['codec_type'] == 'video')
audio = next(s for s in delivery['streams'] if s['codec_type'] == 'audio')
assert int(video['nb_frames']) == 7200 and video['avg_frame_rate'] == '60/1'
assert (video['width'], video['height']) == (1920, 1080)
assert abs(float(delivery['format']['duration']) - 120) < .001
assert audio['sample_rate'] == '48000' and audio['channels'] == 2
silent = probe(MUTE)
assert not any(s['codec_type'] == 'audio' for s in silent['streams'])
(OUT / 'delivery-probe.json').write_text(json.dumps(delivery, ensure_ascii=False, indent=2) + '\n')
(OUT / 'edit.json').write_text(json.dumps({
    'output': str(FINAL), 'silentOutput': str(MUTE), 'frames': 7200, 'seconds': 120,
    'hud': 'Observer HUD, actual city minimap, camera-derived position and heading.',
    'renderResolution': [2560, 1440], 'deliveryResolution': [1920, 1080],
    'audio': 'Original score 天际之上, synthesized effects; two-pass loudness normalization.',
    'measuredSourceLoudness': measurement,
    'shots': [{'id': r['id'], 'title': r['title'], 'seconds': d}
              for r, d in zip(reports, DURATIONS)]
}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'output': str(FINAL), 'seconds': delivery['format']['duration'],
                  'frames': video['nb_frames'], 'bytes': delivery['format']['size']}, ensure_ascii=False))
