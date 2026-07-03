// Piece definitions for 3D Tetris.
// Each piece is a set of unit-cube offsets [x, y, z] plus a neon color.
// z is the vertical (fall) axis; x/y are the horizontal plane.

export const PIECES = [
  // --- Flat tetrominoes (classic, lying on the x/y plane) ---
  { name: 'I', color: 0x00f0ff, cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]] },
  { name: 'O', color: 0xffe600, cells: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { name: 'T', color: 0xd400ff, cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0]] },
  { name: 'L', color: 0xff8a00, cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0]] },
  { name: 'J', color: 0x2b6bff, cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0]] },
  { name: 'S', color: 0x33ff66, cells: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0]] },
  { name: 'Z', color: 0xff3355, cells: [[1, 0, 0], [2, 0, 0], [0, 1, 0], [1, 1, 0]] },

  // --- True 3D tetracubes ---
  // Tripod / branch: three axes from one corner
  { name: 'Tripod', color: 0x00ffa2, cells: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]] },
  // Right-screw (3D S)
  { name: 'Screw', color: 0xff00aa, cells: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  // Tower L: an L that steps up in z
  { name: 'Tower', color: 0x7d5cff, cells: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [1, 1, 1]] },
];

// Rotate a set of cell offsets 90 degrees around the given axis ('x' | 'y' | 'z').
const ROT = {
  x: ([x, y, z]) => [x, -z, y],
  y: ([x, y, z]) => [z, y, -x],
  z: ([x, y, z]) => [-y, x, z],
};

export function rotateCells(cells, axis) {
  return cells.map(ROT[axis]);
}
