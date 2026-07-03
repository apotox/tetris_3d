Build a 3D Tetris game with HTML, Three.js, and React.

The playing field is a three-dimensional 12×12×24 grid.

The game's objects are made up of cubes, and the player can move and rotate the pieces in three dimensions.

The player can rotate the game world around the z-axis (the vertical axis) in 90-degree increments, and can also rotate the pieces around the x- and y-axes.

Swiping left or right rotates the game world, while swiping up or down rotates the piece around the axis perpendicular to the screen.

The world is represented as a 3D grid of cubes, with neon-colored grids marking the boundaries of the play area. The player can see the entire game world from a top-down perspective, with the pieces displayed in 3D space.

---

## Running the MVP

```bash
npm install
npm run dev      # open the printed Local / Network URL
```

`npm run dev` serves on `--host`, so open the **Network** URL on your phone
(same Wi‑Fi) to test on mobile. `npm run build` + `npm run preview` for a
production build.

## Controls

**Touch**
- **3D view** — swipe ⇆ rotates the world 90°, swipe ⇅ rotates the piece
  around the screen axis.
- **Top view** (tap the top-right toggle) — swipes move the piece up/left/down/right.
- On-screen pads: left cluster moves the piece + hard-drop (⤓); right cluster
  rotates the piece (X/Y/Z) and the world (⟲W/⟳W).

**Keyboard**
- Arrows: move piece · Space: hard drop · Shift: soft drop
- Q/A, W/S, E/D: rotate piece around X / Y / Z
- Z/X: rotate world · V: toggle 3D ↔ top view

## Architecture

- `src/game/pieces.js` — piece shapes (flat tetrominoes + true 3D tetracubes) and 90° offset rotation.
- `src/game/engine.js` — pure game logic: grid, collision, gravity, rotation with wall-kicks, line clearing (full row across x or y) with column gravity. No Three.js.
- `src/three/renderer.js` — Three.js scene: neon well, instanced blocks, ghost preview, world-rotation + camera view transitions.
- `src/App.jsx` — React glue: game loop, keyboard/swipe/button input, HUD, mobile UI.

## Well size

The well is set to **12×12×24** via `DEFAULT_DIMS` in `src/game/engine.js` — a
12×12 layer (144 cells) is small enough that filling and clearing full layers is
achievable. Change that one constant to resize the well.
