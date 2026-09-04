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

There is a second, more fundamental playback error. `AudioContextProvider` connects the merged buffer to `createSource().input`. That is a mono-source encoder, which sends the same input to each harmonic gain and then mono ChannelMerger inputs. Setting `channelInterpretation='discrete'` on its first GainNode cannot preserve nine independent recorded harmonics through that graph. Resonance Audio exposes a separate [ambisonicInput for recorded soundfields](https://resonance-audio.github.io/resonance-audio/reference/web/ResonanceAudio). This is tracked in **rl-dqc.8**. Its correction must preserve distance and boundary fade behavior and needs directional render tests. **rl-dqc.9** tracks replacing the ninth-component fallback with an actual mono mix. Ordering alone does not make the current player spatially correct.

The initial issue compared different recordings. Newton-Hills-1-001 matches the AEROJet session near 10 seconds; the AMBBird session matches Newton-Hills-3-001 near 159 seconds. Even the matched AMBBird B-format render is not a clean per-channel reference for the delivered version. Its strongest W correlation is about 0.905, while other channel matches are much weaker and filtered or shifted. That is why the permutation evidence uses the surviving pre-export excerpts. Re-deriving assets requires recovering the actual encoder settings rather than assuming any file named B-format is interchangeable.

The [provenance manifest](audio-provenance.json) contains all 102 delivery basenames. It matches 98 to an archived capsule session using two independent ten-second windows at delivery seconds 5 and 40. Both windows must agree within 5 ms, reach absolute correlation 0.3, and beat the next candidate by 0.15. Bear Butte uses the original uppercase `.WAV` files in `RAW/BEAR BUTTE`, because it has no session in `Edits`. Four Hartford Beach entries remain unresolved because two overlapping source sessions match almost equally well. Both candidates and offsets remain in the manifest. It does not silently select one or establish every intervening sample of a clip. **rl-74x.4** remains open for those ambiguities and a reproducible render recipe.

Good-Earth-2-001 matches `Edits/ICEBrk-OctoMic F8n_Good Earth State Park-Big Sioux River, ice breaking_TAC_SD State Parks.wav`. Its windows align at 151.9910 and 151.9905 seconds, with correlations 0.6181 and 0.6151. A nominal cut at 152 seconds is a strong inference, not a sample-exact recipe. All four Good Earth deliveries align at nominal 32, 92, 152 and 212 seconds in this same ice-breaking session. The roughly 9 ms difference includes encoder/filter timing. The archived eight-channel session contains capsule signals and must undergo calibrated A-to-B encoding before the legacy delivery split. Directly cutting it and converting to FLAC would produce the wrong signal format. **rl-74x.1** has this evidence; its truncated CDN asset has not been replaced.

Two files in `Edits` are zero bytes: the Custer `Prarie Dogs` session and Fisher Grove `Falling Water` session. These failures appear explicitly in the manifest. They did not prevent matching those parks against other surviving sessions.

Verification passed: 34 audio unit tests, TypeScript checks, lint, and production build. A seeded synthetic negative-gain, DC-offset excerpt test recovers the exact correlation offset. A desktop browser decoded Newton-Hills-4-001 as eight channels in both formats. FLAC sample slots matched FFmpeg within 3.1e-7 on the sampled window. Browser AAC-to-FLAC correlations at the same time were 0.99960–0.99998 on the corresponding non-silent slots, with slot 2 silent. This checks browser decode order for that recording, not phone orientation or final directional output. The build retains its existing large-chunk warning.

Reproduce with Python, NumPy, SciPy and FFmpeg, using the archive root that contains `Edits`, `RAW`, `pre-ogg-conversion` and `cdn-delivery-files`:

```sh
python3 scripts/verify-audio-channel-order.py --archive '/Volumes/Samples/Field Recordings/SD State Park Recordings' --out docs/audio-channel-correlation.json
python3 scripts/correlate-audio-provenance.py --archive '/Volumes/Samples/Field Recordings/SD State Park Recordings' --out docs/audio-provenance.json
```

The provenance command exits 1 while any entry is unresolved, after writing all results. `--park Bear-Butte` rechecks one park while preserving the other existing rows. Neither script modifies archive or CDN audio.
