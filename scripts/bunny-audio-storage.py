#!/usr/bin/env python3
"""Manage this project's audio repairs through Bunny's storage-zone API.
Credential: BUNNY_STORAGE_KEY environment variable, or macOS Keychain service
resonant-landscapes.bunny.storage, account resonant-landscapes. Never prints keys.
See https://bunny.net/docs/storage/http for authentication and checksum semantics.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import ssl
import subprocess
import urllib.error
import urllib.request

STORAGE = 'https://ny.storage.bunnycdn.com/resonant-landscapes/'
CDN = 'https://resonant-landscapes.b-cdn.net/'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['list', 'publish', 'verify-cdn'])
    parser.add_argument('--directory', type=Path)
    args = parser.parse_args()
    try:
        import certifi
        tls = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        tls = ssl.create_default_context()
    key = ''
    if args.action != 'verify-cdn':
        key = os.environ.get('BUNNY_STORAGE_KEY') or subprocess.check_output([
            '/usr/bin/security', 'find-generic-password', '-a', 'resonant-landscapes',
            '-s', 'resonant-landscapes.bunny.storage', '-w'], text=True).strip()

    def request(path, data=None, public=False):
        headers = {} if public else {'AccessKey': key}
        if data is not None:
            headers.update({'Content-Type': 'audio/flac',
                            'Checksum': hashlib.sha256(data).hexdigest().upper()})
        req = urllib.request.Request((CDN if public else STORAGE) + path,
                                     data=data, headers=headers,
                                     method='PUT' if data is not None else 'GET')
        with urllib.request.urlopen(req, context=tls, timeout=120) as response:
            return response.read()

    if args.action == 'list':
        print(json.dumps(json.loads(request('')), indent=2))
        return
    if not args.directory:
        parser.error('--directory is required')
    root = args.directory.resolve()
    entries = json.loads((root / 'repair-manifest.json').read_text())
    proof = json.loads((root / 'repair-verification.json').read_text())
    verified = {entry['path'] for entry in proof['files'] if entry['pcmMatchesSource']}
    paths = [entry['path'] for entry in entries]
    if len(set(paths)) != len(paths) or set(paths) != verified:
        raise ValueError('Manifest does not match the verified repair set')
    # Check the complete batch before any write, and never accept arbitrary destinations.
    for entry in entries:
        path = PurePosixPath(entry['path'])
        permitted = (len(path.parts) == 2 and path.parts[0] == 'sounds-mono-w' and path.name.endswith('_w.flac')) or str(path) == 'sounds-flac/Good-Earth-2-001_8ch.flac'
        if not permitted or not (root / path).resolve().is_relative_to(root):
            raise ValueError(f'Unexpected repair path: {path}')
        if hashlib.sha256((root / path).read_bytes()).hexdigest() != entry['sha256']:
            raise ValueError(f'Repair changed after verification: {path}')
    results = []
    report_path = root / ('cdn-verification.json' if args.action == 'verify-cdn' else 'upload-verification.json')
    for entry in entries:
        path = entry['path']
        local = (root / path).read_bytes()
        if args.action == 'publish':
            try:
                previous = request(path)
            except urllib.error.HTTPError as error:
                if error.code != 404:
                    raise
                previous = None
            if previous != local:
                if previous is not None:
                    backup = root / 'backups' / hashlib.sha256(previous).hexdigest() / path
                    backup.parent.mkdir(parents=True, exist_ok=True)
                    backup.write_bytes(previous)
                request(path, data=local)
        actual = request(path, public=args.action == 'verify-cdn')
        matches = hashlib.sha256(actual).hexdigest() == entry['sha256']
        results.append(dict(path=path, bytes=len(actual), sha256=hashlib.sha256(actual).hexdigest(), matches=matches))
        report_path.write_text(json.dumps(results, indent=2) + '\n')
        print(f'{len(results)}/{len(entries)} {"verified" if matches else "MISMATCH"} {path}', flush=True)
    if not all(entry['matches'] for entry in results):
        raise SystemExit('Some CDN responses are stale or differ; inspect the verification report.')
    print(f'{len(results)} files verified against local SHA256 hashes.')


if __name__ == '__main__':
    main()
