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

test('safari variants use wav assets', () => {
  const variants = getParkAudioVariants('Sica Hollow State Park', stateParks, 'Safari');

  assert.ok(variants);
  for (const [eightChannelUrl, monoUrl] of variants) {
    assert.match(eightChannelUrl, /^https:\/\/resonant-landscapes\.b-cdn\.net\/sounds-wav\//);
    assert.match(monoUrl, /^https:\/\/resonant-landscapes\.b-cdn\.net\/sounds-wav\//);
    assert.match(eightChannelUrl, /_8ch\.wav$/);
    assert.match(monoUrl, /_mono\.wav$/);
  }
});

test('Good Earth State Park uses the known-good Safari fallback asset pair', () => {
  const variants = getParkAudioVariants('Good Earth State Park', stateParks, 'Safari');

  assert.deepEqual(variants, [[
    'https://resonant-landscapes.b-cdn.net/sounds/Good-Earth-2-002_8ch.m4a',
    'https://resonant-landscapes.b-cdn.net/sounds/Good-Earth-2-002_mono.m4a',
  ]]);
});

test('Custer State Park uses the CDN slug override for both browser families', () => {
  const safariVariants = getParkAudioVariants('Custer State Park', stateParks, 'Safari');
  const chromeVariants = getParkAudioVariants('Custer State Park', stateParks, 'Chrome');

  assert.ok(safariVariants);
  assert.ok(chromeVariants);
  assert.match(safariVariants[12][0], /\/sounds-wav\/Custer-State-7-001_8ch\.wav$/);
  assert.match(safariVariants[12][1], /\/sounds-wav\/Custer-State-7-001_mono\.wav$/);
  assert.match(chromeVariants[12][0], /\/sounds\/Custer-State-7-001_8ch\.m4a$/);
  assert.match(chromeVariants[12][1], /\/sounds\/Custer-State-7-001_mono\.m4a$/);
});

test('Palisades State Park uses the CDN slug override for both browser families', () => {
  const safariVariants = getParkAudioVariants('Palisades State Park', stateParks, 'Safari');
  const chromeVariants = getParkAudioVariants('Palisades State Park', stateParks, 'Chrome');

  assert.ok(safariVariants);
  assert.ok(chromeVariants);
  assert.match(safariVariants[0][0], /\/sounds-wav\/Palisades-State-1-001_8ch\.wav$/);
  assert.match(safariVariants[0][1], /\/sounds-wav\/Palisades-State-1-001_mono\.wav$/);
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

test('park audio selection stays stable within a single app session', () => {
  const firstSelection = pickSoundPath('Sica Hollow State Park', stateParks, 'Safari');
  const secondSelection = pickSoundPath('Sica Hollow State Park', stateParks, 'Safari');

  assert.deepEqual(secondSelection, firstSelection);
});
