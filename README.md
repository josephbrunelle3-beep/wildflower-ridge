# Wildflower Ridge

*Live your life. Ride your dreams.*

A cosy horse-ranch life sim for the browser, built with Phaser 3, TypeScript and Vite.
This is the vertical slice: one ranch map, a horse to care for and ride, a day/night clock,
a townsperson to meet, two starter quests, and local saves.

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
src/config/              keys, tile catalogue, balance tunables
src/state/GameState.ts   the single serialisable save state
src/core/                EventBus (scene <-> HUD messaging), Session (live state)
src/systems/             Phaser-free logic: time, horse care, quests, saves, economy, interaction
src/entities/            Player, Horse, Npc sprites
src/scenes/              Boot, Title, Ranch (world), UI (HUD overlay)
src/ui/                  panels, hotbar, minimap, care menu, dialogue, pause, toasts
src/gfx/                 placeholder art and the ranch map, both generated at boot
src/data/                quests, items, dialogue JSON
tests/                   Vitest specs for the systems
```

## Swapping in real art

`src/gfx/PlaceholderTextures.ts` documents the frame layout of every generated sheet. Load a
real sheet under the same texture key in `BootScene.preload` and the placeholder for that key
is skipped. Tile order for the tileset is in `src/config/tiles.ts`. See `CREDITS.md` for the
packs planned and their licences.
