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
| E | Interact, talk, mount menu, dismount |
| 1-8 | Select a tool on the hotbar |
| Esc | Pause menu (save, quit) |

### Farming

The kitchen garden is the patch of ground west of the house, between the pond and the path,
with a seed crate and a shipping crate beside it. Stand at a square and press **E** to work it:
bare ground gets turned over, tilled soil opens the sowing list, and a ripe row is picked. To
water, select the **bucket (3)** first.

Crops grow by *watered days*, not calendar days — an unwatered row simply waits, so nothing
dies of neglect. What does kill a crop is the turn of the season: a spring crop caught by
summer withers and has to be cleared. Tomatoes and corn keep bearing after a picking; carrots
and timothy grass go straight into the barn as treats and hay for Star, and everything else
goes in the shipping crate for gold.

| Crop | Season | Watered days | Packet | Sells for |
|---|---|---|---|---|
| Carrots | Spring, Fall | 4 | 36g | feeds Star |
| Timothy Grass | Spring, Summer | 5 | 45g | becomes hay |
| Sweet Peas | Spring | 6 | 60g | 60g |
| Tomatoes | Summer | 7 (regrows in 3) | 90g | 55g |
| Corn | Summer, Fall | 8 (regrows in 4) | 105g | 70g |
| Pumpkins | Fall | 9 | 135g | 170g |

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
src/gfx/FarmLayer.ts     the kitchen garden in the world: soil, crops, crates, [E] handling
src/data/                quests, items, dialogue JSON
tests/                   Vitest specs for the systems
```

## Swapping in real art

`src/gfx/PlaceholderTextures.ts` documents the frame layout of every generated sheet. Load a
real sheet under the same texture key in `BootScene.preload` and the placeholder for that key
is skipped. Tile order for the tileset is in `src/config/tiles.ts`. See `CREDITS.md` for the
packs planned and their licences.
