# Ink Flight — art direction

Written from the seven images in `./refs` (study only, never shipped, never loaded by the game).
Every mark in the game is drawn by code in `src/draw/`.

## Declare

| | |
|---|---|
| **What it is** | A folded white paper plane gliding through an explorer's sketchbook that stands up in space. |
| **What it must look like** | The references come alive: bistre ink, graphite and faded watercolour on yellowed rag paper. |
| **What it must never look like** | Normal 3D with a sepia filter. No lit meshes, no gradients-as-sky, no smooth vector outlines. |
| **Space** | Flat drawn sheets standing in 3D like stage flats; depth comes from layering and parallax, not from modelling. |
| **The one 3D object** | The plane. It is the reader's hand in the book, so it alone has folds and volume. |
| **Light** | Late afternoon, sun low in the west-north-west, seen *through* the paper. |
| **Mood** | Calm, unhurried, no fail state, no score, no people, no readable text. |
| **Proof** | Hero view and fixed cameras screenshotted each round and held next to `./refs`. |

## What the references actually do

**Paper** (Arno scans, notebook page, ruins sheet)
- Warm buff, never white: `#ead9b6` body, `#f1e4c6` where it is cleanest, `#d8c096` toward the edges, `#c9a878` in stains. The second Arno scan and the notebook run cooler and greyer (`#ddd0b4`).
- It is uneven everywhere: cloudy mottling at hand-size scale, darker browned edges, foxing specks, a centre fold, laid lines (the ruins sheet), torn corners.
- Show-through: the notebook page carries faint mirrored writing from its other side. Sheets here are double-sided and the back shows the drawing mirrored and faint.

**Ink line** (Arno landscape)
- Bistre / iron-gall brown, not black: `#3b2412` where the pen is loaded, `#6b4423` typical, `#a07a4c` where it runs dry. Strokes come in runs that start dark and fade until the next dip.
- No long clean contours. Outlines are many short overlapping strokes, tapered at both ends, of uneven weight.
- Weight carries distance: foreground strokes are heavy and dense, far hills are a single hair-thin outline on bare paper.

**Hatching**
- Shadow hatching leans one way (upper-left to lower-right, a left-handed pen), in broken parallel runs.
- Cliff faces: dense vertical strokes that drip. Plains: long horizontal strokes, thinning with distance. Hills: curved strokes that follow the slope.

**Mountains and hills** — stacked lobes with an outline on the crest, hatching on the flank away from the light, paper left bare on the lit side. Farthest ridges are outline plus one flat pale wash (ruins sheet, Webber).

**Trees** — Leonardo: fans of short arcs and comma strokes, loop scribbles for foliage masses, trunks as two quick lines; far trees are a tick with a dot. Ruins sheet: cypresses as flame shapes, flat wash first, zigzag pen over the top.

**Water** — Arno: bare paper with a few horizontal strokes, waterfalls as vertical drips. Map: blue-grey wash `#9fb4b6` that pools darker (`#6f8f97`) along the shore and fades to nothing in open water.

**Wash** (ruins sheet, Webber) — two or three flat tones with hard wet edges; it never follows the pen line exactly and it leaves white paper as the highlight. Webber's colours are barely there: grey-green `#a9ad98`, ochre `#d9c58e`, slate `#8d9488`.

**Sky and cloud** — mostly empty paper (Webber's sky is two thirds of the sheet). Emptiness is the calm.

**Towns** — small boxes with tick hatching on the shadow wall, perched and clustered; a tower above the rest (Arno, left edge).

**Map marks** — pooled coastlines, tiny red-brown boats (`#a5552e`), a crease running across the sheet.

**Paper plane** (photo) — a classic dart. Warm white on the lit wing, cool blue-grey in the folds, crisp creases, a visible second layer of folded paper near the keel.

## Rules for this build

1. **Unlit.** Colour comes from the drawing. The only shading is whether sunlight falls on a sheet or comes through it.
2. **Light through paper.** A sheet between the camera and the sun glows warm and shows its fibres; the same sheet seen from its sunlit side is flat and pale.
3. **Ink for the land, graphite for the air.** Mountains, town, bridge, windmill, lighthouse: bistre pen. Forest, clouds, wind, the plane's creases: grey pencil with paper tooth.
4. **Colour is rare and faded.** Blue-grey water, a little ochre and grey-green on fields, red-brown on roofs and boats. Nothing saturated.
5. **Distance fades ink toward paper**, it never adds fog colour.
6. **Leave paper empty.** If a frame is busy edge to edge, remove marks.
7. **No text.** Margin notes are asemic scribble, there for texture.

## Second pass: the tinted sketch (world-taste)

The first version was about 95% beige on beige. Sky, ground and mountains sat at
the same value, so there was no depth and it read flat in a video. This pass
keeps the old paper and the ink and adds restrained watercolour, the way a
painter goes back over an ink sketch with a small box of colours.

```
WORLD:      An explorer's sketchbook valley standing up as flat drawn sheets: river town and
            bridge, windmill, sea-cliff lighthouse, forest, ringed by mountains
TIME:       Late afternoon, clear, low sun in the west-north-west, a few fair-weather clouds
HERO SHOT:  The spawn: plane low in frame, river leading to town and bridge, falls and
            blue-hazed mountains behind, windmill left, lighthouse right
DIRECTION:  Tinted ink sketchbook, late afternoon (own entry, below)
CAMERA:     low drone (a chase camera behind a flying plane)
DIALS:      REALISM 2 · DENSITY 6 · LIFE 6
```

### Direction: tinted ink sketchbook, late afternoon

Written in the shape of world-taste's art directions. The numbers start from its
#9, Mountain valley ride (sun 18 degrees, gold light, peaks fading into blue haze).
Nothing here is lit in the usual way, so each number is mapped onto what this
renderer actually has.

- **Sun:** elevation 15, azimuth west-north-west. Lit faces are tinted `#fff2db`; it shows on the backdrop as a gold wash `#ecba58` with a soft glow.
- **Fill:** the shadow side takes the sky: cool `#7e8ca8` washes in the drawings, cast shadows `#3a4266` at about 30%.
- **Fog:** aerial haze `#b4c3ce`, mixed into sheets with distance (nothing at 420 units, about 40% by 1900). The ground fades to the horizon cream `#e6dcc2`.
- **Exposure:** none. No tone mapping, bloom or grading; colour is whatever was painted.
- **Palette:** below.
- **Signature:** each mountain rank cooler, bluer and paler than the one in front, with the ink thinning as it goes.
- **References:** `refs/old-map-study.jpg` for water and accents, `refs/webber-ink-wash-bay.jpg` for haze, sage and ochre, `refs/italian-landscape-ruins.jpg` for how wash sits on ink.
- **Kills it:** colour filling every shape; a smooth gradient sky; grey trees on warm paper; far ranges as dark as near ones; saturation anywhere.

### Palette

Paper and ink are unchanged and still lead. Colour is a wash over them, aimed at 30 to 40% of the frame.

| Where | Colour | Hex | How it goes on |
|---|---|---|---|
| Paper | warm buff | `#ead9b6` | left bare wherever light falls |
| Ink | bistre | `#34200e` to `#98724a` | unchanged |
| Sky, high | soft blue | `#96b4c8`, deepening to `#7ca0bc` | graded wash in overlapping bands with wet edges, grain showing through |
| Sky, horizon | warm cream | `#f1e3c4` | bare paper |
| Sun | gold | `#ecba58` | three loose rings of wash, plus the ink ring and rays |
| Far mountains | blue-grey haze | `#9eb0c0` | one flat wash each, lighter ink |
| Shadow sides | cool slate-blue | `#7e8ca8` | on the flank away from the sun, never on the lit side |
| Meadow | pale sage | `#b0ba80` | large patches with gaps |
| Fields | sage `#96a476`, olive `#84864a`, wheat `#d6b05c` | | strip by strip, about one in five left bare |
| Pines and cypress | deep green ink | `#22392e` to `#6c846a`, wash `#3a5c4a` | drawn in green ink, not graphite |
| Round trees | warm olive | `#84864a` | wash under bistre ink |
| River and sea | teal | `#609ea6`, pooling to `#3e7c8c` | pooled at the shore, thinning offshore |
| Water highlights | paper white | `#fcf8ec` | a few short opaque strokes |
| Roofs | terracotta | `#ba623c` | as before, a little stronger |
| Walls | warm cream | `#faf0d6` | body colour, lighter than the paper |
| Shutters and some doors | faded blue | `#7096b2` | on about a third of the houses |
| Clouds | white body colour, shadow `#96a6bc` | | soft white puff, thin ink outline on top, light blue-grey wash beneath |

### What the references show about colour

1. On the map the water is a teal blue-grey that pools darker along the shore and thins almost to paper offshore.
2. The map leaves the land bare. Colour lives in the water and in a few small accents: red-brown boats, rose dots.
3. In the Webber the far cliff is cooler and paler than the near shore: grey-green going to blue-grey, with ochre only close by.
4. The Webber sky is two thirds of the sheet, uneven, cooler high up and warm cream near the horizon.
5. The palms in the Webber are dark olive ink, the darkest thing in the picture. Trees are never grey.
6. In the ruins sheet wash is two or three flat tones with hard wet edges, and it misses the pen line.
7. Paper is left untouched where the light falls. The wash is the shadow and the local colour, not the light.
8. Nothing is saturated. The strongest colour in all seven images is the red-brown of the boats.

### Changes to the rules above

- Rule 3 is now: **ink for the land, green ink for the forest, soft body colour for the clouds.** Graphite stays for wind.
- Rule 4 is now: **colour is restrained, not rare.** About a third of the frame, never filling every shape.
- Rule 5 is now: **distance cools and pales.** Sheets take on blue-grey haze with distance; the ground fades to the horizon cream.
- The sky is no longer empty paper: a graded blue wash high up, bare cream low down.
- Sheets thin out as they turn edge-on, so a flat is never seen as a hard sliver.

## Build order

1. Paper and the pen: seeded paper grain, tapered strokes with ink load, hatching, wash with pooled edges, pencil with tooth.
2. Drawings on flat canvases, checked in a 2D gallery against the references before any 3D.
3. The set: ground map sheet, standing sheets in layers, sky backdrop, light-through-paper material.
4. The plane and the flight model, chase camera.
5. Air: clouds that smudge, pencil wind, gusts, birds.
6. Sound, generated.
7. Browser check rounds, at least three.

## Slop list (reject on sight)

- A smooth gradient anywhere (sky, fog, water).
- Uniform line weight, or outlines that close perfectly.
- Pure black ink or pure white paper.
- Hatching that is evenly spaced or tiles visibly.
- Wash that fills exactly to the line.
- Sheets that light like 3D objects, or cast crisp real-time shadows.
- Sheets that turn to face the camera. (Birds and wind are marks in the air, not sheets, and do face the viewer.)
- Bloom, lens flare, depth of field, film grain laid over the whole screen.
- Saturated colour, especially green grass and blue sky.
- Readable words, UI panels, meters, score.
- The same tree, house or cloud repeated side by side.
- Texture blur at the distances the camera actually flies.

## Browser check log

Each round: hero view plus fixed cameras (`?cam=`) captured at 1600x900 on the RTX 4060, held next to `./refs`, faults listed, then fixed. Drawings were first reviewed flat (`?gallery=`) before any 3D.

| Round | What was wrong against the references | What changed |
|---|---|---|
| Flat 1 | Washes were rounded pills, hatching far too sparse for the Arno sheet, peaks were smooth bumps, cut edges looked airbrushed | Ridged crest generator, tiered flank hatching, brushed wash shapes with wet edges, thin edge browning |
| Flat 2 | Trees had spiky scallops and disc washes; pencil firs looked ruled | Round comma strokes, one wash per crown, scribbled boughs |
| 0 | Ink too faint at flying distance, mountains lost in fade, backlit hills glowed yellow, sky showed a weave, clouds a busy band, plane a white tent | Bolder pen for sheets, half the distance fade, calmer light, neutral grain, fewer clouds, fold tones on the plane |
| 1 | Strokes went soft when the camera came close; hills still blank; cloud outlines had loops inside; white band at the sea horizon; shadows invisible | Stroke edge restored under magnification, hill fields and scrub, outline only on the true silhouette, fade colour matched to the sky, stronger shadow wash |
| 2 | Sunlit paper bleached white; clouds read as white stickers; a road ran into the river | Warm pale for sunlit faces, cloud paper matched to the page, road moved |
| 3 | Town thinned to slivers from the west; cloud sheets streaked edge-on; plane squat from the chase camera | Rows, houses, hills and tree lines facing east and west too; cloud layers at three angles that thin out edge-on; longer dart and a higher camera |
| 4 | Cloud shading read as rain; ink still light for bistre | Shading turned near-level under the belly; marks deepened in proportion to their darkness |
| 5 | Lingering in a cloud rubbed the pencil out into a bright patch | Smudge now steps with the plane, drags the drawing along the path and leaves a grey rubbed streak |
| 6 | Wind strokes hard to see; a low cloud hung over the opening view | Heavier pencil wind at true proportion; two clouds moved; spawn turned to hold windmill, town, falls and lighthouse in one frame |

| 7 (tint, A) | 95% beige: sky, ground and mountains one value; clouds read as rain | Palette written first. Graded sky wash, blue-grey haze with distance, warm lit and cool shadow tints, white body-colour clouds with an ink outline, sheets fade edge-on |
| 8 (tint, B) | First pass over-greened the ground edge to edge; multiplied blue went grey on yellow paper; cloud layers stacked into stripes | Ground colour cut back to patches with paper between; sky laid as a glaze so it reads blue; each cloud is now two crossed sheets that trade places |
| 9 (world-check 1) | Flag: the view away from the sun was brighter than the references (0.762 against 0.64); ink too pale after the edge-crisping threshold moved | Ink deepened, sunlit paper toned down, show-through from behind strengthened |
| 10 (world-check 2) | No must-fix, nothing flagged. Colour share measured at 14 to 34% of the frame against 0 to 2% before | Sky wash and meadow strengthened slightly; hero now 21%, forest and lighthouse 34% |

### What still differs from the references, and why it was left

- **Line density.** Leonardo's sheet is far denser in the foreground than anything here. At flying distance more strokes turn to grey noise, so density was traded for legibility.
- **Colour share.** Measured by hue, colour is 21% of the hero frame and 34% of the forest and lighthouse views; the windmill view is 14%. The brief asked for 30 to 40%. Pushing the hero further meant filling the ground edge to edge, which broke the "patchy, not every shape" rule, so it was left under.
- **Clouds.** They are flat puffs with one shadow tone. The references barely show clouds, so these are invented, and they are the least reference-led drawings in the game. From some angles both crossed sheets of a cloud show at once.
- **Edge-on sheets.** They now fade instead of showing as slivers, which means a hill or a row of houses can thin away as you pass beside it.
- **Camera height.** world-taste asks for ground level; this is a flying game, so the camera is a low drone. The `ground` check camera sits by the river to keep one eye-level view honest.

Known compromises: the ground map is one 4096 px drawing, so strokes close under the plane are thick rather than fine.
