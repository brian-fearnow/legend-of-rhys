# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Static HTML5 canvas platformer — no build step, no dependencies, no package.json. Open `index.html` directly in a browser or use any static file server.

```bash
# Run locally
open index.html
# or
npx serve .
```

Deploy to production by pushing to `main`; Vercel auto-deploys via GitHub integration.

## Architecture

All game logic lives in two files:

- **`index.html`** — canvas element, HUD spans (`#levelDisplay`, `#coinsDisplay`, `#livesDisplay`), `#overlay` (start/win/gameover screen), `#touch-controls` (mobile buttons), and inline CSS.
- **`game.js`** — everything else, structured in sections top-to-bottom:
  1. Constants and shared state (`gameState`, `keys`, `cameraX`, `currentLevel`)
  2. Web Audio sound system (`playSound`)
  3. `Particle` class (coin-collect sparkles)
  4. `Player` class — movement uses **separate X then Y collision phases** to avoid corner misclassification; never revert to the old center-of-mass `colCheck` approach
  5. `Platform`, `Coin`, `Spike`, `Castle` classes
  6. `createLevel(n)` — returns `{ platforms, coins, spikes, castle }` for levels 1–3
  7. Game loop: `update()` → `draw()` → `requestAnimationFrame`
  8. State handlers: `handleDeath`, `handleWin`, `gameOver`, `startGame`
  9. Input listeners (keyboard + touch)

## Key conventions

- **Game states**: `'start'`, `'playing'`, `'levelcomplete'`, `'gameover'`, `'win'`. The loop only schedules the next frame when state is `'playing'`. Level transitions must set state to `'levelcomplete'` before showing the overlay — otherwise the loop keeps running and stacks a second loop when Continue is clicked.
- **Camera**: world coordinates throughout; `ctx.translate(-cameraX, 0)` applied once per draw. Background (clouds, hills) is drawn before the translate so it stays fixed.
- **Coins persist across levels** — `initGame(resetCoins)` only resets coins when `resetCoins` is true (fresh game/restart), not on level transitions.
- **High score** stored in `localStorage` under key `legendOfRhys_best`.
- **Spike hitbox** uses a 5px inset margin (`checkSpike`) so near-misses feel fair.
