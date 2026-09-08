# Wildflower Ridge

*Live your life. Ride your dreams.*

A cosy horse-ranch life sim for the browser, built with Phaser 3, TypeScript and Vite.
This is the vertical slice: one ranch map, a horse to care for and ride, a kitchen garden to
work, a day/night clock, a townsperson to meet, three starter quests, and local saves.

## Play

```bash
npm install
npm run dev
```

Open http://localhost:5173.

| Key | Action |
|---|---|
| WASD / arrows | Walk (or steer the horse) |
| Shift | Run / gallop |
| Space | Jump (mounted, needs pace) |
| E | Interact, talk, work the garden, mount menu, dismount |
| 1-8 | Select a tool on the hotbar |
| Esc | Pause menu (save, quit) |

### Farming

West of the house, between the pond and the path, is a fenced farmyard with a gate onto the
track. Inside are the workable rows, a seed crate, a shipping crate and the pump.

Stand at a square and press **E** to work it: bare ground gets turned over, tilled soil opens
the sowing list, weeds get pulled, a ripe row is picked. To water, select the **bucket (3)** —
it holds twelve waterings and refills at the pump. Field work takes real time off the clock,
so a big garden is a morning's work.

**Crops need looking after.** Growth is counted in *watered days*, not calendar days, so a row
only comes on when you water it. Miss a morning and it wilts — the soil cracks and the plant
goes sallow — and a third dry morning kills it where it stands. Weeds sprout on
their own and choke a square until they are pulled; bare soil left weedy goes back to grass.
The turn of the season kills anything still standing out of its months. Rain overnight waters
the whole garden for you, which is the one mercy the valley offers.

Bring a crop all the way in without a single dry or choked day and it comes up a **prize
crop** — twice the yield. That is the difference between a garden that pays and one that
merely survives.

Carrots and timothy grass go straight into the barn as treats and hay for Star; everything
else goes in the shipping crate for gold.

| Crop | Season | Watered days | Packet | Sells for |
|---|---|---|---|---|
| Carrots | Spring, Fall | 4 | 36g | feeds Star |
| Timothy Grass | Spring, Summer | 5 | 45g | becomes hay |
| Sweet Peas | Spring | 6 | 60g | 60g |
| Tomatoes | Summer | 7 (regrows in 3) | 90g | 55g |
| Corn | Summer, Fall | 8 (regrows in 4) | 105g | 70g |
| Pumpkins | Fall | 9 | 135g | 170g |

Every number above — growth times, prices, how fast a crop dies of thirst, how often weeds
take hold, the chance of rain — is in `src/config/crops.ts`.

### Riding

Star carries her own momentum. She takes a moment to wind up, and from a gallop she will
run on for about five seconds if you simply drop the reins — to pull up sharply, hold the
direction *against* the way she is going and she reins back. She also cannot pivot at
speed: the faster she goes the wider she turns, so line up early.

Press **Space** at a canter or gallop to jump. She clears fences, bushes, rocks and the
water trough; trees, buildings and the pond stay solid whether she is airborne or not.
You cannot step off a moving horse — rein her in first.

Get Star's trust up by petting and feeding her, select the saddle (7) to tack up, then choose
Ride from her care menu. Sleep in the house after 6 PM to end the day; the game autosaves.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit tests for the pure systems (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |

Append `?st=1` to the URL to run the game loop on timers instead of requestAnimationFrame
(keeps it ticking in a hidden tab; handy for automated testing).

## Layout

```
src/main.ts              Phaser config and boot
src/config/              keys, tile catalogue, balance tunables, the crop table
src/state/GameState.ts   the single serialisable save state
src/core/                EventBus (scene <-> HUD messaging), Session (live state)
src/systems/             Phaser-free logic: time, horse care, farming, quests, saves, economy, interaction
src/entities/            Player, Horse, Npc sprites
src/scenes/              Boot, Title, Ranch (world), UI (HUD overlay)
src/ui/                  panels, hotbar, minimap, care menu, seed/shipping menu, dialogue, pause, toasts
src/gfx/                 placeholder art, the crop sheet and the ranch map, all generated at boot
src/gfx/FarmLayer.ts     the farmyard in the world: soil, crops, crates, pump, [E] handling
src/gfx/FarmYard.ts      fences the yard in and lays the track to its gate
src/data/                quests, items, dialogue JSON
tests/                   Vitest specs for the systems
```

## Swapping in real art

`src/gfx/PlaceholderTextures.ts` documents the frame layout of every generated sheet. Load a
real sheet under the same texture key in `BootScene.preload` and the placeholder for that key
is skipped. Tile order for the tileset is in `src/config/tiles.ts`. See `CREDITS.md` for the
packs planned and their licences.
