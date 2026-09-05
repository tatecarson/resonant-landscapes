# Audio delivery investigation, 2026-09-04

The delivery split rearranges the nine source channels, and the app previously concatenated them without undoing that permutation. Source channel 2 survives at delivery channel 6. Delivery channel 2 is silent because it contains the source's silent channel 6. The accompanying file named `mono` contains source channel 8, not source channel 0 or an intentional mono mix.

This finding comes from the archived `pre-ogg-conversion/extract_channels.sh` and independent sample correlation. The script exports `[0,1,6,7,4,5,2,3]` into the eight-channel file and `8` into the one-channel file. Four surviving nine-channel excerpts match delivery windows in both AAC and lossless families. Every non-silent channel picks the predicted source channel, with correlations from 0.902 to above 0.999. The silence-to-silence correspondence follows the export script and matching null slots; silence itself cannot identify a channel by correlation. Full measurements and source hashes are in [audio-channel-correlation.json](audio-channel-correlation.json).

| Delivery slot | Source slot | Component under the source's assumed ACN convention |
| --- | --- | --- |
| 8ch 0 | 0 | W |
| 8ch 1 | 1 | Y |
| 8ch 2 | 6 | R, silent |
| 8ch 3 | 7 | S |
| 8ch 4 | 4 | V |
| 8ch 5 | 5 | T |
| 8ch 6 | 2 | Z, height |
| 8ch 7 | 3 | X |
| mono 0 | 8 | U |

`mergeDeliveryBuffers` now restores original source order by swapping merged slots 2/6 and 3/7. It preserves the strict length/sample-rate checks and avoids another full nine-channel allocation. The generic concatenation utility retains its original behavior. This establishes the delivery-to-source index mapping. It does not independently establish the source encoder's normalization, microphone orientation, or calibration.

The player also sent the merged buffer through `createSource().input`, a mono point-source encoder. The repair routes nine discrete channels through `ambisonicInput`, constructs the decoder with second order at initialization, and applies physical-distance gain before the decoder. Calling `setAmbisonicOrder(2)` after construction only changes future source encoders in the installed SDK; it leaves the listener at first order. Both problems are addressed in **rl-dqc.8**.

Directional render tests also exposed a basis mismatch in the SDK orientation setter. The player now supplies a world-to-listener rotation in ACN YZX coordinates through `setListenerFromMatrix`, with the Gimbal inverse sensor basis converted explicitly. Analytic front, right and overhead fields render in the expected direction in headed WebKit and Chromium tests. An isolated second-order component survives. These tests exercise the actual installed decoder before its binaural HRTF, not physical headphone listening or the archived microphone calibration.

For **rl-dqc.9**, a collapsed spatial decode now fetches a separately exported channel-0 W file from `sounds-mono-w`. The legacy ninth-component file remains available for full soundfield reconstruction. Missing or invalid W fallback produces a load error. Cancellation prevents fallback results from entering the cache.

The initial issue compared different recordings. Newton-Hills-1-001 matches the AEROJet session near 10 seconds; the AMBBird session matches Newton-Hills-3-001 near 159 seconds. Even the matched AMBBird B-format render is not a clean per-channel reference for the delivered version. Its strongest W correlation is about 0.905, while other channel matches are much weaker and filtered or shifted. That is why the permutation evidence uses the surviving pre-export excerpts. Re-deriving assets requires recovering the actual encoder settings rather than assuming any file named B-format is interchangeable.

The [provenance manifest](audio-provenance.json) contains all 102 delivery basenames. It matches 98 to an archived capsule session using two independent ten-second windows at delivery seconds 5 and 40. Both windows must agree within 5 ms, reach absolute correlation 0.3, and beat the next candidate by 0.15. Bear Butte uses the original uppercase `.WAV` files in `RAW/BEAR BUTTE`, because it has no session in `Edits`. Four Hartford Beach entries remain unresolved because two overlapping source sessions match almost equally well. Both candidates and offsets remain in the manifest. It does not silently select one or establish every intervening sample of a clip. **rl-74x.4** remains open for those ambiguities and a reproducible render recipe.

Good-Earth-2-001 matches `Edits/ICEBrk-OctoMic F8n_Good Earth State Park-Big Sioux River, ice breaking_TAC_SD State Parks.wav`. Its windows align at 151.9910 and 151.9905 seconds, with correlations 0.6181 and 0.6151. A nominal cut at 152 seconds is a strong inference, not a sample-exact recipe. All four Good Earth deliveries align at nominal 32, 92, 152 and 212 seconds in this same ice-breaking session. The roughly 9 ms difference includes encoder/filter timing. The archived eight-channel session contains capsule signals and must undergo calibrated A-to-B encoding before the legacy delivery split. Directly cutting it and converting to FLAC would produce the wrong signal format. **rl-74x.1** has this evidence. A practical repair uses the intact AAC delivery twin, decoded to 16-bit PCM and wrapped in FLAC. This restores all 2,646,016 samples without pretending to recover a lossless master. The embedded comment and repair manifest label its lossy source. A calibrated master rerender remains separate work.

Two files in `Edits` are zero bytes: the Custer `Prarie Dogs` session and Fisher Grove `Falling Water` session. These failures appear explicitly in the manifest. They did not prevent matching those parks against other surviving sessions.

Verification passed: 34 audio unit tests, TypeScript checks, lint, and production build. A seeded synthetic negative-gain, DC-offset excerpt test recovers the exact correlation offset. A desktop browser decoded Newton-Hills-4-001 as eight channels in both formats. FLAC sample slots matched FFmpeg within 3.1e-7 on the sampled window. Browser AAC-to-FLAC correlations at the same time were 0.99960–0.99998 on the corresponding non-silent slots, with slot 2 silent. This checks browser decode order for that recording, not phone orientation or final directional output. The build retains its existing large-chunk warning.

Reproduce with Python, NumPy, SciPy and FFmpeg, using the archive root that contains `Edits`, `RAW`, `pre-ogg-conversion` and `cdn-delivery-files`:

```sh
python3 scripts/verify-audio-channel-order.py --archive '/Volumes/Samples/Field Recordings/SD State Park Recordings' --out docs/audio-channel-correlation.json
python3 scripts/correlate-audio-provenance.py --archive '/Volumes/Samples/Field Recordings/SD State Park Recordings' --out docs/audio-provenance.json
```

The provenance command exits 1 while any entry is unresolved, after writing all results. `--park Bear-Butte` rechecks one park while preserving the other existing rows. Neither script modifies archive or CDN audio.


## Repair verification and storage access

The corpus audit was run for this repair on 2026-09-04/05. All 408 current delivery files decoded. Good-Earth-2-001 was the only hard failure, with 2,572,280 spatial samples versus 2,646,016 in its ninth component. It also confirmed the silent delivery slot in all 204 spatial files.

`prepare-audio-repairs.py` stages 102 genuine channel-0 fallback files and the Good Earth replacement. It verifies every file against the expected decoded PCM and checks that the repaired Good Earth pair has equal lengths. It never modifies the source archive or uploads anything.

`bunny-audio-storage.py` uses the existing New York storage zone. It reads `BUNNY_STORAGE_KEY` or the macOS Keychain item with service `resonant-landscapes.bunny.storage` and account `resonant-landscapes`. No key belongs in the repository or client app. Authentication and uploads follow [Bunny's storage HTTP API](https://bunny.net/docs/storage/http).

```sh
python3 scripts/bunny-audio-storage.py list
python3 scripts/prepare-audio-repairs.py --delivery '/Volumes/Samples/Field Recordings/SD State Park Recordings/cdn-delivery-files' --out /tmp/rl-audio-repairs
python3 scripts/bunny-audio-storage.py publish --directory /tmp/rl-audio-repairs
python3 scripts/bunny-audio-storage.py verify-cdn --directory /tmp/rl-audio-repairs
```

Publishing validates the entire staged manifest before writing, saves a local backup of any replaced file, sends SHA256 checksums with each upload, and reads each file back from storage. Public CDN verification is separate so a stale cached object cannot be mistaken for a successful public repair. The helper does not delete storage objects or change CDN settings.

The expanded local suite passes 225 unit tests, TypeScript, lint and the production build. The existing large-chunk warning remains. The PR stays in draft pending real-phone listening and final archive convention verification.


Published verification on 2026-09-05: all 103 storage objects and public CDN responses match their staged SHA256 hashes. The old Good Earth CDN object required a targeted cache purge. The full audit then measured all 408 files with zero download failures, decode failures or pair mismatches. The four previously observed Hartford Beach DC-offset warnings remain. [Publication hashes and audit summary](audio-repair-verification.json) record the result.

Headed tests on the PR HTTPS preview pass in WebKit/iPhone 13 and Chromium/Pixel 7 for the repaired Good Earth pair, exact W samples, forced-downmix playback, park switching and interruption recovery. The network-delay park-switch test blocks service workers because WebKit cannot intercept their fetches. Other playback checks use the normal production preview. These emulated devices do not replace listening with a physical phone and headphones. **rl-dz0** tracks recovering the lossless master after the practical AAC-source repair.


Debug park follow-up, 2026-09-05 (**rl-oam**): the two debug parks still selected separate legacy WAV files totaling 47,628,508 bytes, outside the production corpus audit. Their complete decoded PCM matches Custer-State-1-002 exactly, in both the eight-channel and ninth-component files. They now reuse that recording through the normal browser-family selection: 14,212,259 bytes for Safari and 9,985,926 for AAC browsers, including the existing verified W fallback. Direct debug visits also expose Start Audio during loading, since they bypass the welcome screen's audio-unlock gesture. The original WAV pair loaded in emulated browsers; a permanent decode stall on the user's physical phone has not been independently established.


The user confirmed that Field Console → Unlock Audio immediately starts playback on the affected physical iPhone, and reported this extra step was not needed before PR100. The visible park action now unlocks during loading and starts automatically once buffers are ready. Headed tests on the deployed preview pass in both iPhone/WebKit and Pixel/Chromium for a deliberately held download followed by Start Audio, nine-channel playback, normal welcome-screen unlock, and interruption recovery (eight checks). The normal unlock test explicitly enables diagnostics on the production preview; its initial missing-bridge failure was a test configuration issue. A physical-phone recheck of the new visible start action remains part of rl-dqc.8.
