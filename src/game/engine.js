import { PIECES, rotateCells } from './pieces.js';

// Default well dimensions: 12 x 12 footprint, 24 tall.
export const DEFAULT_DIMS = { x: 12, y: 12, z: 24 };

export const idx = (d, x, y, z) => x + y * d.x + z * d.x * d.y;

export class Engine {
  constructor(dims = DEFAULT_DIMS) {
    this.d = { ...dims };
    this.grid = new Uint8Array(this.d.x * this.d.y * this.d.z); // 0 empty, else colorIndex+1
    this.colors = [0]; // palette; index 0 unused
    this.score = 0;
    this.lines = 0;
    this.gameOver = false;
    this.piece = null;
    this.next = this._randomPiece();
    this.spawn();
  }

  _randomPiece() {
    const def = PIECES[(Math.random() * PIECES.length) | 0];
    return { name: def.name, color: def.color, cells: def.cells.map((c) => [...c]) };
  }

  spawn() {
    const def = this.next;
    this.next = this._randomPiece();
    // Register color, get a stable palette index.
    let ci = this.colors.indexOf(def.color);
    if (ci === -1) {
      ci = this.colors.length;
      this.colors.push(def.color);
    }
    this.piece = {
      name: def.name,
      color: def.color,
      colorIndex: ci,
      cells: def.cells.map((c) => [...c]),
      // Spawn centered horizontally, near the top of the well.
      pos: [
        Math.floor(this.d.x / 2) - 2,
        Math.floor(this.d.y / 2) - 1,
        this.d.z - 2,
      ],
    };
    if (this._collides(this.piece.cells, this.piece.pos)) {
      this.gameOver = true;
    }
  }

  absCells(cells, pos) {
    return cells.map(([x, y, z]) => [x + pos[0], y + pos[1], z + pos[2]]);
  }

  _collides(cells, pos) {
    const d = this.d;
    for (const [x, y, z] of this.absCells(cells, pos)) {
      if (x < 0 || x >= d.x || y < 0 || y >= d.y || z < 0 || z >= d.z) return true;
      if (this.grid[idx(d, x, y, z)] !== 0) return true;
    }
    return false;
  }

  // Move the active piece by a delta; returns true if the move was applied.
  move(dx, dy, dz) {
    if (this.gameOver || !this.piece) return false;
    const np = [this.piece.pos[0] + dx, this.piece.pos[1] + dy, this.piece.pos[2] + dz];
    if (this._collides(this.piece.cells, np)) return false;
    this.piece.pos = np;
    return true;
  }

  // Rotate the active piece around an axis, with small wall kicks.
  rotate(axis) {
    if (this.gameOver || !this.piece) return false;
    const rotated = rotateCells(this.piece.cells, axis);
    const kicks = [
      [0, 0, 0],
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1],
      [2, 0, 0], [-2, 0, 0], [0, 2, 0], [0, -2, 0],
    ];
    for (const [kx, ky, kz] of kicks) {
      const np = [this.piece.pos[0] + kx, this.piece.pos[1] + ky, this.piece.pos[2] + kz];
      if (!this._collides(rotated, np)) {
        this.piece.cells = rotated;
        this.piece.pos = np;
        return true;
      }
    }
    return false;
  }

  // The lowest position the current piece can fall to (for the ghost preview).
  ghostPos() {
    if (!this.piece) return null;
    const p = [...this.piece.pos];
    while (!this._collides(this.piece.cells, [p[0], p[1], p[2] - 1])) p[2] -= 1;
    return p;
  }

  // One gravity tick. Returns true if a piece locked.
  step() {
    if (this.gameOver || !this.piece) return false;
    if (this.move(0, 0, -1)) return false;
    this._lock();
    return true;
  }

  hardDrop() {
    if (this.gameOver || !this.piece) return;
    let dropped = 0;
    while (this.move(0, 0, -1)) dropped++;
    this.score += dropped * 2;
    this._lock();
  }

  _lock() {
    const d = this.d;
    const v = this.piece.colorIndex + 1;
    for (const [x, y, z] of this.absCells(this.piece.cells, this.piece.pos)) {
      if (z >= 0 && z < d.z) this.grid[idx(d, x, y, z)] = v;
    }
    this._clearLines();
    this.spawn();
  }

  // Clear any completed line — a full row across x (fixed y, z) or across y
  // (fixed x, z) — then let unsupported cells fall straight down along z.
  _clearLines() {
    const d = this.d;
    const { x: X, y: Y, z: Z } = d;
    const clear = new Uint8Array(this.grid.length);
    let cleared = 0;

    for (let z = 0; z < Z; z++) {
      // Rows spanning the full x extent, at each y.
      for (let y = 0; y < Y; y++) {
        let full = true;
        for (let x = 0; x < X; x++) {
          if (this.grid[idx(d, x, y, z)] === 0) { full = false; break; }
        }
        if (full) {
          cleared++;
          for (let x = 0; x < X; x++) clear[idx(d, x, y, z)] = 1;
        }
      }
      // Rows spanning the full y extent, at each x.
      for (let x = 0; x < X; x++) {
        let full = true;
        for (let y = 0; y < Y; y++) {
          if (this.grid[idx(d, x, y, z)] === 0) { full = false; break; }
        }
        if (full) {
          cleared++;
          for (let y = 0; y < Y; y++) clear[idx(d, x, y, z)] = 1;
        }
      }
    }

    if (cleared === 0) return;

    // Remove the cleared cells.
    for (let i = 0; i < clear.length; i++) if (clear[i]) this.grid[i] = 0;

    // Column gravity: compact each (x, y) column downward so floating cells fall.
    for (let y = 0; y < Y; y++) {
      for (let x = 0; x < X; x++) {
        let write = 0;
        for (let z = 0; z < Z; z++) {
          const v = this.grid[idx(d, x, y, z)];
          if (v !== 0) {
            if (write !== z) {
              this.grid[idx(d, x, y, write)] = v;
              this.grid[idx(d, x, y, z)] = 0;
            }
            write++;
          }
        }
      }
    }

    this.lines += cleared;
    // Bonus scoring for clearing multiple lines at once.
    this.score += cleared * 100 + (cleared - 1) * 50;
  }

  // Drop interval in ms, speeds up as lines are cleared.
  dropInterval() {
    return Math.max(120, 800 - this.lines * 25);
  }
}
