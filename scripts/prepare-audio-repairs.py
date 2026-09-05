#!/usr/bin/env python3
"""Stage genuine W fallbacks and an explicitly lossy-source Good Earth repair.
No upload or source mutation. Requires ffmpeg; verify counts and signal samples
before publishing the staged tree to the existing CDN storage zone.
"""
import argparse
import hashlib
import json
import pathlib
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--delivery', type=pathlib.Path, required=True)
parser.add_argument('--out', type=pathlib.Path, required=True)
args = parser.parse_args()
repair_base = 'Good-Earth-2-001'
repair = args.out / 'sounds-flac' / f'{repair_base}_8ch.flac'
repair.parent.mkdir(parents=True, exist_ok=True)
source_aac = args.delivery / 'sounds' / f'{repair_base}_8ch.m4a'
subprocess.run(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', str(source_aac),
                '-c:a', 'flac', '-sample_fmt', 's16', '-compression_level', '8',
                '-metadata', 'comment=rl-74x.1: repaired from intact CDN AAC, lossy source in FLAC; replace after calibrated master render is recovered.',
                str(repair)], check=True)
entries = []
files = sorted((args.delivery / 'sounds-flac').glob('*_8ch.flac'))
if len(files) != 102:
    raise ValueError(f'Expected 102 spatial files, found {len(files)}')
for original in files:
    base = original.stem.removesuffix('_8ch')
    source = repair if base == repair_base else original
    target = args.out / 'sounds-mono-w' / f'{base}_w.flac'
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', str(source),
                    '-af', 'pan=mono|c0=c0', '-c:a', 'flac', '-compression_level', '8',
                    '-metadata', 'comment=Omnidirectional fallback: delivery channel 0 / source W; not the legacy ninth component named mono.',
                    str(target)], check=True)
    entries.append(dict(path=str(target.relative_to(args.out)), source=str(source),
                        sha256=hashlib.sha256(target.read_bytes()).hexdigest(), bytes=target.stat().st_size))
    print(target.name, flush=True)
entries.append(dict(path=str(repair.relative_to(args.out)), source=str(source_aac), lossySource=True,
                    sha256=hashlib.sha256(repair.read_bytes()).hexdigest(), bytes=repair.stat().st_size))
(args.out / 'repair-manifest.json').write_text(json.dumps(entries, indent=2) + '\n')
print(f'Staged {len(entries)} files, {sum(e["bytes"] for e in entries)/1e6:.1f} MB. Nothing uploaded.')

# Verify decoded PCM rather than merely trusting successful encodes.
def pcm(path, channel=None):
    command = ['ffmpeg', '-nostdin', '-v', 'error', '-i', str(path)]
    if channel is not None:
        command += ['-af', f'pan=mono|c0=c{channel}']
    return subprocess.check_output(command + ['-f', 's16le', '-c:a', 'pcm_s16le', '-'])

checks = []
for entry in entries:
    target = args.out / entry['path']
    source = pathlib.Path(entry['source'])
    expected = pcm(source, None if entry.get('lossySource') else 0)
    actual = pcm(target)
    if actual != expected:
        raise ValueError(f'Decoded PCM mismatch: {target}')
    channels = 8 if entry.get('lossySource') else 1
    checks.append(dict(path=entry['path'], channels=channels,
                       samples=len(actual)//(2*channels), pcmMatchesSource=True,
                       pcmSha256=hashlib.sha256(actual).hexdigest()))
mono_reference = args.delivery / 'sounds-wav-mono' / f'{repair_base}_mono.wav'
repair_samples = len(pcm(repair)) // 16
reference_samples = len(pcm(mono_reference)) // 2
if repair_samples != reference_samples:
    raise ValueError(f'Good Earth length mismatch: {repair_samples} != {reference_samples}')
report = dict(files=checks, goodEarthSamples=repair_samples,
              goodEarthNinthComponentSamples=reference_samples, published=False)
(args.out / 'repair-verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(f'Verified exact decoded PCM for {len(checks)} files; Good Earth pair: {repair_samples} samples.')
