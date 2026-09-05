# The two empty session WAVs

Measured 2026-09-05 against the archive at
`/Volumes/Samples/Field Recordings/SD State Park Recordings` (rl-74x.6).

`Edits/` holds exactly two zero-byte files:

| file | dated |
| --- | --- |
| `ANMLRdnt-OctoMic F8n_Custer State Park, SD-Prarie Dogs_Carter Gordon_SD State Parks.wav` | 2024-01-07 |
| `WATRImpt-OctoMic F8n_Fisher Grove, SD-Falling Water_Carter Gordon_SD State Parks.wav` | 2024-01-08 |

They are 0 bytes, not corrupt. ffmpeg reports `Invalid data found when
processing input` because there is nothing to open, and the provenance scan
recorded that as `ffmpeg could not decode source` — which describes a master
this archive holds in a format nothing can read, and would be worth chasing.
What is actually here is a filename with no recording behind it, which is
worth knowing and not chasing. `correlate-audio-provenance.py` now checks the
size first and says so; the wording in `audio-provenance.json` corrects itself
on the next regeneration.

## Nothing ships from either of them

This is the part that decides how much they matter. Every delivery for both
parks correlates to a populated source, so no recording anyone can walk to
depends on an empty file:

- **Custer State Park** — 18 deliveries, all `matched`, spread across four
  populated `Prarie Dog*` edits.
- **Fisher Grove State Park** — 2 deliveries, both `matched`, both to
  `WIND-OctoMic F8n_Fisher Grove State Park-Wind`.

The four `unresolved` rows in `audio-provenance.json` are all Hartford Beach
and have populated candidates of their own. Neither empty file is a runner-up
for anything.

## They are not the same kind of gap

**Custer is a superseded stub.** Six populated siblings share its prefix and
its date, and the empty one carries the least specific name of the seven —
`Prarie Dogs` with no descriptor, against `Prarie Dogs, Car on Gravel, Grate,
Wind,` and the rest. It reads as a first export that was replaced by
descriptively named ones rather than as a lost take. Nothing is missing.

**Fisher Grove is a genuinely missing edit.** It is the only `WATRImpt`
(water impact) file for the park; the two populated Fisher Grove edits are
both `WIND`. So the falling-water edit does not survive anywhere in `Edits/`.

The material behind it probably does survive, though, in `RAW/FISHER GROVE`.
Three takes are there, and durations pair them off exactly — each edit runs
one second longer than its take, consistent across both pairs:

| RAW take | duration | matching edit |
| --- | --- | --- |
| `FISHER GROVE-T010.WAV` | 2:31 | `…Fisher Grove State Park-Wind` (2:32) |
| `FISHER GROVE-T011.WAV` | 1:51 | `…Fisher Grove, SD-Wind` (1:52) |
| `FISHER GROVE-T012.WAV` | 5:14 | **none** |

T012 is the orphan, and the only Fisher Grove take with no edit. It is the
same capture format as the others — eight capsule channels, 96 kHz, 7.1
layout — so it is the obvious candidate for the missing falling-water edit.

That is a lead, not a conclusion. Nobody has listened to T012 to confirm it is
falling water, and re-cutting an edit from it is an artistic decision about
what the walk should contain, not a repair. It is recorded here so the option
is not lost; it is deliberately not acted on.

## What was not done

Nothing on the archive drive was modified. Both empty files are left in place:
deleting them would remove the only surviving evidence that the Fisher Grove
falling-water edit was ever made, and that evidence is the reason this note
can point at T012 at all.
