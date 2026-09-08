# Construct your digital twin

A research instrument for a mediated study on the self and the digital self.

A participant sits at the canvas, writes attributes about themselves in answer
to timed prompts, and watches a digital twin gradually take those attributes
over. The session ends when they decide: **"yes my DS is me!"** or **"I don't
feel like myself anymore."** Everything they write, move, hand over, or let go
of is recorded.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

That is the whole setup. The database is a SQLite file at `data/chi.db`, created
on first use — no server, no login, nothing to configure. A session can be run
on a laptop with the network off.

| route   | what it is                                                    |
| ------- | ------------------------------------------------------------- |
| `/`     | the canvas the participant uses                               |
| `/data` | the facilitator's dashboard, with CSV and JSON export          |

For a real run: `npm run build && npm start`.

---

## How a session goes

1. **Name.** The participant types their name. That mints a code like `#RS01` —
   initials plus a participant number. No account, no login; the code exists
   only so a canvas can be traced back to the person who sat in front of it.
2. **START.** The facilitator explains the canvas out loud, then the participant
   presses START and the timer runs.
3. **Rounds.** One prompt at a time, 30 seconds each, eight rounds by default —
   one per attribute dimension. The prompt is drawn at random from that
   dimension's pool of four, so no two participants get the same sequence.
   The participant types a word or a whole phrase; each one lands on the canvas
   as a chip beside their self.
4. **The system takes some.** At the end of each round the system hands a random
   3 to 5 of the participant's attributes to the digital self and says which. The
   count is drawn per round rather than fixed per participant: people write two
   attributes in thirty seconds or they write ten, and a fixed quota would not
   survive that.
5. **The participant moves the rest.** Chips can be dragged, thrown, clicked, and
   dropped on either figure for the whole session. Dropping one on the digital
   self hands it over; dropping it back on the self takes it back; dropping it
   into the "let go" well destroys it, which is why *removed* and *received* are
   two different numbers in the table.
6. **The digital self rebuilds.** It starts dark and deformed and becomes a
   replica of the static self on the left as it receives attributes. The
   reconstruction is measured against everything ever written, so attributes that
   were destroyed rather than handed over put a full replica permanently out of
   reach.
7. **The verdict.** Green or red, whenever the participant wants. Writing closes
   after the last round but the canvas stays live until they choose.

### The attribute table

| counter        | meaning                                                     |
| -------------- | ----------------------------------------------------------- |
| total written  | everything the participant typed                            |
| removed        | everything that has left their self, handed over or let go   |
| left           | still theirs                                                |
| received       | what the digital self holds                                 |
| to be gained   | what it could still be given                                |

With nothing destroyed, `removed == received` and `left == to be gained`, which
is the state the Figma comp is drawn in.

---

## Tuning a run

Two ways, both writing the values into the session row so a run can always be
reconstructed from its data.

**The gear**, top right of the canvas, deliberately faint. Seconds per prompt,
number of prompts, how many attributes the system takes and how often, whether
dimensions are shuffled, whether letting go is allowed, whether the instruction
cards appear.

**The URL**, for setting up before the participant arrives:

```
/?seconds=45&rounds=6&min=2&max=4&every=2&shuffle=0&coach=0&discard=0
```

| parameter  | default | meaning                                          |
| ---------- | ------- | ------------------------------------------------ |
| `seconds`  | 30      | seconds per prompt round                         |
| `rounds`   | 8       | number of prompt rounds                          |
| `min`/`max`| 3 / 5   | attributes the system takes each time            |
| `every`    | 1       | take every N rounds                              |
| `shuffle`  | on      | randomise the order of the dimensions            |
| `coach`    | on      | show the two instruction cards                   |
| `discard`  | on      | allow letting attributes go                      |

---

## The prompts

Eight dimensions, four prompts each, in `src/lib/prompts.ts`. Editing that file
is all it takes to change or add to them — the round planner reads whatever is
there.

Physical · Physiological · Perceptual · Cognitive · Personality · Emotional
state · Ethics · Behaviour

---

## The data

`/data` lists every participant with their counts and how they ended, and links
two exports:

- **`attributes.csv`** — one row per attribute: participant code, the exact text
  they typed, its dimension, the prompt that was on screen, the round, when it
  was written, which side it ended on, when and how it moved, and where it sits
  on the canvas.
- **`export.json`** — the same plus the full event log for every session:
  every write, move, transfer, return, discard, instruction card, and the ending.

A single session is at `/api/export?session=<id>`.

Set `TWIN_DASHBOARD_PASSWORD` to put the dashboard behind `?key=…`. It is open by
default, which is right for a laptop in a room and wrong for the public internet.

### The tables

`sessions` (id, code, name, timestamps, end reason, duration, the config it ran
with) · `attributes` (text, dimension, prompt, round, side, transfer time and
method, canvas position) · `events` (an append-only log) · `counters` (the
participant number).

To run against a hosted database instead of a local file, set
`TWIN_DATABASE_URL` and `TWIN_DATABASE_AUTH_TOKEN` to a Turso database. Same
code path; only the URL scheme changes.

---

## How the canvas is built

The Figma artboard is 4481 × 2739. Every element is positioned in those units
and the whole board is scaled by a single transform to fit the viewport, so what
renders is a reproduction of the comp rather than an approximation of it. The
coordinates, colours, radii and shadows in `src/game/layout.ts` and
`src/app/globals.css` were read out of the exported Figma node tree, not eyeballed.

Sora is self-hosted as one variable font file covering all six weights the comp
uses. GSAP drives the motion — Draggable and InertiaPlugin for the chips,
MotionPath for their arcs, and a tween on an SVG displacement filter for the
digital self's reconstruction.

```
src/
  app/          routes, the API, the dashboard, and globals.css
  components/   Stage, Twin, AttributeTable, Chip/ChipLayer, InputBar, Overlays
  game/         layout constants, the rules engine, the session hook, persistence
  lib/          prompts, config, types, the database
scripts/
  build_assets.py   turns the raw Figma export into public/assets
  shoot.mjs         drives a whole session in a browser and screenshots it
```

### Regenerating the character assets

The two figures export from Figma with clean alpha. The pedestal does not — it
comes with the artboard's off-white baked in behind a very soft drop shadow. The
script keys it out properly (flood from the border, keep what the flood cannot
reach, ramp the alpha by distance from the background, un-premultiply so nothing
keeps a pale halo):

```bash
pip install Pillow
python3 scripts/build_assets.py "path/to/export-everything (7)/7"
```

### Screenshots and layout checks

```bash
npm run dev
node scripts/shoot.mjs screenshots        # a full session, one screenshot per state
node scripts/check-viewports.mjs          # the canvas at six display sizes
```

The first drives a whole session in a real browser — name, START, writing,
dragging, letting go, the instruction cards, the verdict — and writes a numbered
screenshot of each. The second reports whether anything overflows at 4K down to
a phone, which is worth running against an unfamiliar display before a session.

The artboard is wide, so on a narrow screen the canvas scales down to fit and
the build says so rather than letting a session run on something unusable. Use a
laptop or larger.

---

## Open questions for the study

- **Letting go.** The canvas notes say participants "give away **or** destroy"
  attributes, but the comp is drawn with `removed` and `received` equal, which
  only happens when nothing is destroyed. The well is implemented and on by
  default; turn it off with `discard=0` if handing over should be the only way
  to shed an attribute.
- **Session length.** Eight dimensions at 30 seconds is four minutes of writing.
  The notes mention five. `seconds` and `rounds` cover either.
- **The reconstruction measure.** The digital self is complete when it holds
  everything the participant ever wrote. If destroying should not cap it, that is
  one line in `reconstruction()` in `src/game/engine.ts`.
