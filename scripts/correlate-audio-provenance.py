#!/usr/bin/env python3
"""Locate CDN excerpts in archived capsule sessions. Requires numpy, scipy, ffmpeg.

The offsets are waveform alignments, not sample-exact render recipes: the
A-to-B encoder introduces filtering/latency. Two independent windows must agree.
Only matching park names are searched; unresolved matches remain explicit.
"""
import argparse
import json
import pathlib
import subprocess
import numpy as np
from scipy.signal import correlate

RATE = 2000
WINDOWS = (5, 40)
SECONDS = 10


def decode(path, channels, start=None, duration=None):
    args = ['ffmpeg', '-v', 'error']
    if start is not None:
        args += ['-ss', str(start)]
    args += ['-i', str(path)]
    if duration is not None:
        args += ['-t', str(duration)]
    args += ['-af', f'pan={len(channels)}C|' + '|'.join(
        f'c{i}=c{c}' for i, c in enumerate(channels)), '-ar', str(RATE),
        '-f', 'f32le', '-c:a', 'pcm_f32le', '-']
    return np.frombuffer(subprocess.check_output(args), dtype='<f4').reshape(-1, len(channels))


def match(source, excerpt):
    x = source.astype(float)
    y = excerpt.astype(float)
    y -= y.mean()
    n = len(y)
    if len(x) < n or not np.any(y):
        return 0.0, 0
    corr = correlate(x, y, mode='valid', method='fft')
    sums = np.r_[0, np.cumsum(x)]
    squares = np.r_[0, np.cumsum(x*x)]
    variance = np.maximum(squares[n:] - squares[:-n] - (sums[n:] - sums[:-n])**2 / n, 1e-30)
    corr /= np.sqrt(variance * np.sum(y*y))
    index = int(np.argmax(np.abs(corr)))
    return float(corr[index]), index


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=pathlib.Path, required=True)
    parser.add_argument('--out', type=pathlib.Path, required=True)
    parser.add_argument('--park', help='Recheck one park and retain other rows in an existing manifest')
    args = parser.parse_args()
    root = args.archive
    deliveries = sorted((root / 'cdn-delivery-files/sounds-flac').glob('*_8ch.flac'))
    if len(deliveries) != 102:
        raise ValueError(f'Expected 102 delivery files; found {len(deliveries)}')
    sources = sorted((root / 'Edits').glob('*.wav'))
    results = []
    source_errors = []
    if args.park and args.out.exists():
        previous = json.loads(args.out.read_text())
        results = [r for r in previous["recordings"] if r["delivery"].rsplit("-", 2)[0] != args.park]
        source_errors = previous.get("sourceErrors", [])
    for park in sorted({f.stem.rsplit('-', 2)[0] for f in deliveries}):
        if args.park and park != args.park:
            continue
        words = park.lower().split('-')
        candidates = [f for f in sources if all(w in f.name.lower() for w in words)]
        if not candidates:
            candidates = [f for f in (root / 'RAW').rglob('*')
                          if f.suffix.lower() == '.wav' and all(w in str(f.relative_to(root)).lower() for w in words)]
        cache = {}
        for f in candidates:
            try:
                cache[f] = decode(f, list(range(8)))
            except subprocess.CalledProcessError:
                source_errors.append(dict(source=str(f.relative_to(root)), error='ffmpeg could not decode source'))
                print('SOURCE ERROR', f.name, flush=True)
        for delivery in [f for f in deliveries if f.stem.rsplit('-', 2)[0] == park]:
            excerpts = [decode(delivery, [0], start=t, duration=SECONDS)[:, 0] for t in WINDOWS]
            ranks = []
            for source, data in cache.items():
                evidence = []
                for t, y in zip(WINDOWS, excerpts):
                    scores = [(abs(c), c, k / RATE - t, channel)
                              for channel in range(8)
                              for c, k in [match(data[:, channel], y)]]
                    _, correlation, offset, channel = max(scores)
                    evidence.append(dict(deliveryWindowSeconds=t, signedCorrelation=correlation,
                                         sourceOffsetSeconds=offset, sourceCapsuleChannel=channel))
                agreement = abs(evidence[0]['sourceOffsetSeconds'] - evidence[1]['sourceOffsetSeconds'])
                score = min(abs(e['signedCorrelation']) for e in evidence) if agreement <= 0.005 else 0
                ranks.append(dict(source=str(source.relative_to(root)), score=score,
                                  offsetDisagreementSeconds=agreement, windows=evidence))
            ranks.sort(key=lambda r: r['score'], reverse=True)
            best = ranks[0] if ranks else None
            confirmed = best is not None and best['score'] >= 0.3 and (len(ranks) == 1 or best['score'] - ranks[1]['score'] >= 0.15)
            row = dict(delivery=delivery.stem.removesuffix('_8ch'), status='matched' if confirmed else 'unresolved',
                       match=best, runnerUp=ranks[1] if len(ranks) > 1 else None)
            results.append(row)
            print(row['delivery'], row['status'], best['score'] if best else None, flush=True)
            args.out.write_text(json.dumps(dict(schemaVersion=1, analysisRate=RATE,
                method='Delivery channel 0 against all 8 capsule channels; independent 5s and 40s windows, 10s each.',
                offsetMeaning='Waveform alignment includes encoder latency/filter phase; not a sample-exact cut recipe.',
                sourceErrors=source_errors, recordings=sorted(results, key=lambda r: r['delivery'])), indent=2) + '\n')
    return 0 if all(r['status'] == 'matched' for r in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
