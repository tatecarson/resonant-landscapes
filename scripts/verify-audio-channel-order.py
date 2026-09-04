#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
import subprocess
import numpy as np

parser = argparse.ArgumentParser(description="Verify the legacy export permutation against surviving nine-channel excerpts.")
parser.add_argument('--archive', type=pathlib.Path, required=True)
parser.add_argument('--out', type=pathlib.Path, required=True)
args = parser.parse_args()
ROOT = args.archive

def decode(path, rate, channels, start=0, duration=10):
    # Decode from the beginning so AAC seek/priming behavior cannot shift the window.
    cmd = ['ffmpeg', '-v', 'error', '-i', str(path), '-t', str(start + duration),
           '-af', f'pan={len(channels)}C|' + '|'.join(f'c{i}=c{c}' for i,c in enumerate(channels)),
           '-ar', str(rate), '-f', 'f32le', '-c:a', 'pcm_f32le', '-']
    data = np.frombuffer(subprocess.check_output(cmd), dtype='<f4').reshape(-1, len(channels))
    return data[round(start * rate):round((start + duration) * rate)]

cases=[('Sica-Hollow-1-001','*Sica*001.wav',32),('Newton-Hills-3-002','*Newton*001.wav',18),('Newton-Hills-3-003','*Newton*002.wav',18),('Newton-Hills-4-001','*Newton*003.wav',18)]
output=[]
expected = [0, 1, 6, 7, 4, 5, 2, 3, 8]
valid = True
for base,pat,offset in cases:
 f=next((ROOT/'pre-ogg-conversion/sources').glob(pat))
 x=decode(f,44100,channels=list(range(9)),start=offset+5,duration=10).astype(float)
 for family,spatial,mono in [('lossless','sounds-flac/'+base+'_8ch.flac','sounds-wav-mono/'+base+'_mono.wav'),('aac','sounds/'+base+'_8ch.m4a','sounds/'+base+'_mono.m4a')]:
  y=np.column_stack([decode(ROOT/'cdn-delivery-files'/spatial,44100,channels=list(range(8)),start=5,duration=10),decode(ROOT/'cdn-delivery-files'/mono,44100,channels=[0],start=5,duration=10)]).astype(float)
  matrix=[]
  for k in range(9):
   if not np.any(y[:,k]):matrix.append({'deliveryChannel':k,'silent':True});continue
   scores=[(j,float(np.corrcoef(x[:,j],y[:,k])[0,1])) for j in range(9) if np.any(x[:,j])]
   best=max(scores,key=lambda a:abs(a[1]));j,c=best
   matrix.append(dict(deliveryChannel=k,sourceChannel=j,correlation=c,gain=float(np.dot(x[:,j],y[:,k])/np.dot(x[:,j],x[:,j]))))
  row=dict(delivery=base,family=family,source=str(f.relative_to(ROOT)),sourceSHA256=hashlib.sha256(f.read_bytes()).hexdigest(),sourceOffsetSeconds=offset,windowSeconds=[5,15],channels=matrix)
  row['verified'] = not np.any(x[:,6]) and all(
      c.get('silent', False) if i == 2 else c.get('sourceChannel') == expected[i] and c.get('correlation', 0) > 0.85
      for i,c in enumerate(matrix))
  valid = valid and row['verified']
  print(json.dumps(row),flush=True);output.append(row)
args.out.write_text(json.dumps(output,indent=2)+'\n')

raise SystemExit(0 if valid else 1)
