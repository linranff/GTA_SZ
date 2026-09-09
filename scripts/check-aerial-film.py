"""Verify the delivered movie, including every decoded frame and audio levels."""
from pathlib import Path
import hashlib
import json
import re
import subprocess

OUT = Path(__file__).resolve().parent.parent / 'output/aerial-film'
FINAL = OUT / '深城纪-天际之上-1080p60-HUD.mp4'
FFMPEG = '/opt/homebrew/bin/ffmpeg'

with (OUT / 'decode-qa.log').open('w') as log:
    subprocess.run([
        FFMPEG, '-hide_banner', '-y', '-i', str(FINAL), '-map', '0:v:0',
        '-vf', 'blackdetect=d=.15:pix_th=.01:pic_th=.99,freezedetect=n=.00005:d=.5',
        '-an', '-f', 'framemd5', str(OUT / 'frame-hashes.txt')
    ], stdout=log, stderr=subprocess.STDOUT, check=True)

frames = []
for line in (OUT / 'frame-hashes.txt').read_text().splitlines():
    if line.startswith('#') or not line.strip():
        continue
    fields = [f.strip() for f in line.split(',')]
    frames.append({'pts': int(fields[2]), 'duration': int(fields[3]), 'md5': fields[5]})
assert len(frames) == 7200
assert [f['pts'] for f in frames] == list(range(7200))
assert all(f['duration'] == 1 for f in frames)
duplicates = [i for i in range(1, len(frames)) if frames[i]['md5'] == frames[i - 1]['md5']]
assert not duplicates, f'Adjacent duplicate frames: {duplicates}'
decode_log = (OUT / 'decode-qa.log').read_text()
defects = [line for line in decode_log.splitlines()
           if any(token in line for token in ('black_start:', 'freeze_start:', 'Error while decoding', 'corrupt decoded frame'))]
assert not defects, defects

with (OUT / 'audio/delivery-loudness.log').open('w') as log:
    subprocess.run([
        FFMPEG, '-hide_banner', '-i', str(FINAL), '-vn',
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json,silencedetect=n=-55dB:d=.5',
        '-f', 'null', '-'
    ], stdout=log, stderr=subprocess.STDOUT, check=True)
audio_log = (OUT / 'audio/delivery-loudness.log').read_text()
loudness = json.loads(re.findall(r'\{\s*"input_i".*?\}', audio_log, re.S)[-1])
assert -17.5 <= float(loudness['input_i']) <= -14.5
assert float(loudness['input_tp']) <= -.8

digest = hashlib.sha256()
with FINAL.open('rb') as source:
    while block := source.read(1024 * 1024):
        digest.update(block)
report = {
    'file': str(FINAL), 'sha256': digest.hexdigest(), 'bytes': FINAL.stat().st_size,
    'decodedFrames': len(frames), 'uniqueFrameHashes': len({f['md5'] for f in frames}),
    'ptsContinuous': True, 'adjacentDuplicateFrames': duplicates,
    'blackOrFreezeEvents': defects, 'audio': loudness,
    'audioSilenceEvents': [s for s in audio_log.splitlines() if 'silence_start:' in s or 'silence_end:' in s]
}
(OUT / 'delivery-qa.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False))
