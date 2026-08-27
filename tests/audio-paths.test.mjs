/**
 * Unit coverage for audio CDN path generation.
 * Keeps slug formatting, browser-specific asset families, and stable path
 * selection logic from drifting without needing a browser run.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import stateParks from '../src/data/stateParks.json' with { type: 'json' };
import { formatParkSlug, getParkAudioVariants, pickAssetFamily, pickSoundPath } from '../src/utils/audioPaths.js';

test('every park in stateParks.json expands into valid audio URL pairs', () => {
  for (const park of stateParks) {
    const variants = getParkAudioVariants(park.name, stateParks, 'Chrome');

    assert.ok(variants, `expected audio variants for ${park.name}`);
    assert.equal(variants.length, park.recordingsCount * park.sectionsCount);

    for (const [eightChannelUrl, monoUrl] of variants) {
      assert.doesNotThrow(() => new URL(eightChannelUrl));
      assert.doesNotThrow(() => new URL(monoUrl));
      assert.match(eightChannelUrl, /_8ch\.m4a$/);
      assert.match(monoUrl, /_mono\.m4a$/);
    }
  }
});

test('safari variants use flac 8ch and wav mono assets', () => {
  const variants = getParkAudioVariants('Sica Hollow State Park', stateParks, 'Safari');

  assert.ok(variants);
  for (const [eightChannelUrl, monoUrl] of variants) {
    assert.match(eightChannelUrl, /^https:\/\/resonant-landscapes\.b-cdn\.net\/sounds-flac\//);
    assert.match(monoUrl, /^https:\/\/resonant-landscapes\.b-cdn\.net\/sounds-wav-mono\//);
    assert.match(eightChannelUrl, /_8ch\.flac$/);
    assert.match(monoUrl, /_mono\.wav$/);
  }
});

test('Good Earth State Park expands into all Safari variants from metadata', () => {
  const variants = getParkAudioVariants('Good Earth State Park', stateParks, 'Safari');

  assert.equal(variants?.length, 4);
  assert.match(variants?.[0]?.[0] ?? '', /\/sounds-flac\/Good-Earth-1-001_8ch\.flac$/);
  assert.match(variants?.[0]?.[1] ?? '', /\/sounds-wav-mono\/Good-Earth-1-001_mono\.wav$/);
  assert.match(variants?.[3]?.[0] ?? '', /\/sounds-flac\/Good-Earth-2-002_8ch\.flac$/);
  assert.match(variants?.[3]?.[1] ?? '', /\/sounds-wav-mono\/Good-Earth-2-002_mono\.wav$/);
});

test('Custer State Park uses the CDN slug override for both browser families', () => {
  const safariVariants = getParkAudioVariants('Custer State Park', stateParks, 'Safari');
  const chromeVariants = getParkAudioVariants('Custer State Park', stateParks, 'Chrome');

  assert.ok(safariVariants);
  assert.ok(chromeVariants);
  assert.match(safariVariants[12][0], /\/sounds-flac\/Custer-State-7-001_8ch\.flac$/);
  assert.match(safariVariants[12][1], /\/sounds-wav-mono\/Custer-State-7-001_mono\.wav$/);
  assert.match(chromeVariants[12][0], /\/sounds\/Custer-State-7-001_8ch\.m4a$/);
  assert.match(chromeVariants[12][1], /\/sounds\/Custer-State-7-001_mono\.m4a$/);
});

test('debug-only parks reuse the Custer Test audio pair', () => {
  const custerTestVariants = getParkAudioVariants('Custer Test', stateParks, 'Chrome');
  const currentLocationVariants = getParkAudioVariants('Current Location Test', stateParks, 'Chrome');

  assert.deepEqual(currentLocationVariants, custerTestVariants);
  assert.match(currentLocationVariants?.[0]?.[0] ?? '', /\/sounds\/Custer-Test-1-001_8ch\.wav$/);
  assert.match(currentLocationVariants?.[0]?.[1] ?? '', /\/sounds\/Custer-Test-1-001_mono\.wav$/);
});

test('Palisades State Park uses the CDN slug override for both browser families', () => {
  const safariVariants = getParkAudioVariants('Palisades State Park', stateParks, 'Safari');
  const chromeVariants = getParkAudioVariants('Palisades State Park', stateParks, 'Chrome');

  assert.ok(safariVariants);
  assert.ok(chromeVariants);
  assert.match(safariVariants[0][0], /\/sounds-flac\/Palisades-State-1-001_8ch\.flac$/);
  assert.match(safariVariants[0][1], /\/sounds-wav-mono\/Palisades-State-1-001_mono\.wav$/);
  assert.match(chromeVariants[0][0], /\/sounds\/Palisades-State-1-001_8ch\.m4a$/);
  assert.match(chromeVariants[0][1], /\/sounds\/Palisades-State-1-001_mono\.m4a$/);
});

test('slug formatting matches current CDN naming convention', () => {
  assert.equal(formatParkSlug('Custer State Park'), 'Custer-State');
  assert.equal(formatParkSlug('Palisades State Park'), 'Palisades-State');
  assert.equal(formatParkSlug('Fort Sisseton Historic State Park'), 'Fort-Sisseton');
  assert.equal(formatParkSlug('Good Earth State Park'), 'Good-Earth');
  assert.equal(formatParkSlug('Bear Butte State Park'), 'Bear-Butte');
});

test('no generated URL points at retired wav assets (rl-tbu, rl-u2s)', () => {
  // Guards two retirements:
  //  - rl-tbu: sounds-wav/*_8ch.wav files were deleted from the CDN.
  //  - rl-u2s: sounds-wav/ itself was renamed to sounds-wav-mono/ after the
  //    mono-only re-upload, so any remaining sounds-wav/ URL is a 404.
  const retiredFolderPattern = /\/sounds-wav\//;
  const retired8chPattern = /_8ch\.wav$/;
  for (const park of stateParks) {
    for (const userAgent of ['Chrome', 'Safari']) {
      const variants = getParkAudioVariants(park.name, stateParks, userAgent);
      if (!variants) continue;
      for (const [spatialUrl, monoUrl] of variants) {
        for (const url of [spatialUrl, monoUrl]) {
          assert.doesNotMatch(url, retiredFolderPattern, `${park.name} (${userAgent}) hit retired sounds-wav/ folder: ${url}`);
          assert.doesNotMatch(url, retired8chPattern, `${park.name} (${userAgent}) hit retired _8ch.wav asset: ${url}`);
        }
      }
    }
  }
});

test('park audio selection stays stable within a single app session', () => {
  const firstSelection = pickSoundPath('Sica Hollow State Park', stateParks, 'Safari');
  const secondSelection = pickSoundPath('Sica Hollow State Park', stateParks, 'Safari');

  assert.deepEqual(secondSelection, firstSelection);
});

// rl-06c.2: real user-agent strings, not the 'Chrome' / 'Safari' shorthand the
// tests above use. The old branch was /Safari/.test(ua) && !/Chrome/.test(ua),
// which made "not Safari" mean "can decode 8ch AAC" for every unrecognised
// engine. These pin the allowlist and, more importantly, the default.
const USER_AGENTS = {
  'iOS Safari': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'macOS Safari': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'iOS Chrome': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  'iOS Firefox': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  'Android Chrome': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'desktop Chrome': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'desktop Firefox': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Android Firefox': 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  'Edge': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  'Samsung Internet': 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  'headless Chrome': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36',
  'iOS Edge': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 EdgiOS/126.0 Mobile/15E148 Safari/605.1.15',
  'unknown engine': 'Mozilla/5.0 (SomeFutureOS 1.0) SomeFutureEngine/1.0',
  'empty': '',
};

const AAC_AGENTS = ['Android Chrome', 'desktop Chrome', 'desktop Firefox', 'Android Firefox', 'Edge', 'Samsung Internet', 'headless Chrome'];
const LOSSLESS_AGENTS = ['iOS Safari', 'macOS Safari', 'iOS Chrome', 'iOS Firefox', 'iOS Edge', 'unknown engine', 'empty'];

test('engines verified to decode 8ch AAC get the aac family', () => {
  for (const label of AAC_AGENTS) {
    assert.equal(pickAssetFamily(USER_AGENTS[label]), 'aac', `${label} should use aac`);
  }
});

test('WebKit, iOS wrappers and unrecognised engines fall back to lossless', () => {
  for (const label of LOSSLESS_AGENTS) {
    assert.equal(pickAssetFamily(USER_AGENTS[label]), 'lossless', `${label} should use lossless`);
  }
});

test('an unrecognised engine gets flac 8ch and wav mono, never 8ch aac', () => {
  // The actual rl-06c.2 fix. Under the old branch this UA matched neither
  // Safari nor Chrome, so it fell through to untested 8-channel AAC.
  const variants = getParkAudioVariants('Sica Hollow State Park', stateParks, USER_AGENTS['unknown engine']);

  assert.ok(variants);
  for (const [eightChannelUrl, monoUrl] of variants) {
    assert.match(eightChannelUrl, /\/sounds-flac\/.*_8ch\.flac$/);
    assert.match(monoUrl, /\/sounds-wav-mono\/.*_mono\.wav$/);
  }
});

test('real iOS Safari and Android Chrome keep the families they had before', () => {
  const safariVariants = getParkAudioVariants('Good Earth State Park', stateParks, USER_AGENTS['iOS Safari']);
  const chromeVariants = getParkAudioVariants('Good Earth State Park', stateParks, USER_AGENTS['Android Chrome']);

  assert.match(safariVariants?.[0]?.[0] ?? '', /\/sounds-flac\/Good-Earth-1-001_8ch\.flac$/);
  assert.match(safariVariants?.[0]?.[1] ?? '', /\/sounds-wav-mono\/Good-Earth-1-001_mono\.wav$/);
  assert.match(chromeVariants?.[0]?.[0] ?? '', /\/sounds\/Good-Earth-1-001_8ch\.m4a$/);
  assert.match(chromeVariants?.[0]?.[1] ?? '', /\/sounds\/Good-Earth-1-001_mono\.m4a$/);
});
