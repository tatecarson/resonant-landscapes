/**
 * Unit coverage for audio CDN path generation.
 * Keeps slug formatting, browser-specific asset families, and stable path
 * selection logic from drifting without needing a browser run.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import stateParks from '../src/data/stateParks.json' with { type: 'json' };
import { formatParkSlug, getParkAudioVariants, pickSoundPath } from '../src/utils/audioPaths.js';

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
