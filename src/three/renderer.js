import * as THREE from 'three';
import { idx } from '../game/engine.js';

// Renders the game engine state into a Three.js scene.
// Coordinate mapping: game (x, y, z) -> three (x, z, y) so that the game's
// vertical z axis maps to Three's up (y). Everything is centered on the well.
export class Renderer {
  constructor(canvas, dims) {
    this.d = dims;
    this.viewMode = 'iso'; // 'iso' | 'top'
    this.worldSteps = 0; // 90deg increments around vertical axis

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05050a);
    this.scene.fog = new THREE.Fog(0x05050a, dims.z * 0.9, dims.z * 2.6);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 4000);

    // World group rotates around the vertical axis for the "rotate world" control.
    this.world = new THREE.Group();
    this.scene.add(this.world);

    // Lights
    this.scene.add(new THREE.AmbientLight(0x8899ff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(1, 2, 1);
    this.scene.add(dir);
    const p = new THREE.PointLight(0x66ccff, 0.6, 0);
    p.position.set(0, dims.z, 0);
    this.scene.add(p);

    this._buildWell();
    this._buildInstances();

    // Camera follows the active piece's height (the well is very tall, so a
    // fixed frame would leave freshly spawned pieces above the top of screen).
    this._camTarget = new THREE.Vector3(0, 0, 0);
    // Start framed near where pieces spawn (top of the well).
    this.focusY = dims.z / 2 - 1.5;
    this._targetFocusY = this.focusY;
    this._goalPos = new THREE.Vector3();
    this._goalTarget = new THREE.Vector3();
    this._applyCameraGoal(true);

    this.resize();
  }

  _c(x, y, z) {
    // game cell center -> three world position (centered well)
    return [
      x - this.d.x / 2 + 0.5,
      z - this.d.z / 2 + 0.5,
      y - this.d.y / 2 + 0.5,
    ];
  }

  _buildWell() {
    const { x: W, y: D, z: H } = this.d;
    // Neon wireframe box around the play volume.
    const box = new THREE.BoxGeometry(W, H, D);
    const edges = new THREE.EdgesGeometry(box);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.55 })
    );
    this.world.add(line);

    // Floor grid in neon.
    const floor = new THREE.GridHelper(Math.max(W, D), Math.max(W, D), 0xff00c8, 0x224488);
    floor.position.y = -H / 2;
    // GridHelper is W x W; scale to match footprint if non-square.
    floor.scale.set(W / Math.max(W, D), 1, D / Math.max(W, D));
    floor.material.transparent = true;
    floor.material.opacity = 0.4;
    this.world.add(floor);

    // A subtle solid floor so pieces read against a surface.
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshBasicMaterial({ color: 0x0a0a18, transparent: true, opacity: 0.7 })
    );
    slab.rotation.x = -Math.PI / 2;
    slab.position.y = -H / 2 - 0.01;
    this.world.add(slab);
  }

  _makeInstanced(count, opts = {}) {
    const geo = new THREE.BoxGeometry(0.92, 0.92, 0.92);
    // Bright per-instance diffuse colors on the dark scene read as neon; a
    // little emissive lift keeps blocks from going flat in shadow.
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.35,
      metalness: 0.1,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Three caches an InstancedMesh's bounding sphere from the first frame and
    // never updates it as instances move, so frustum culling would wrongly hide
    // the piece once its stale sphere leaves view. We only have a few meshes, so
    // just skip culling entirely.
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.world.add(mesh);
    return mesh;
  }

  _buildInstances() {
    const total = this.d.x * this.d.y * this.d.z;
    this.settled = this._makeInstanced(total);
    this.active = this._makeInstanced(64);
    this.ghost = this._makeInstanced(64, { transparent: true, opacity: 0.18 });
    this._m = new THREE.Matrix4();
    this._col = new THREE.Color();
  }

  _setInstance(mesh, i, x, y, z, colorHex, brightness = 1) {
    const [tx, ty, tz] = this._c(x, y, z);
    this._m.makeTranslation(tx, ty, tz);
    mesh.setMatrixAt(i, this._m);
    this._col.setHex(colorHex).multiplyScalar(brightness);
    mesh.setColorAt(i, this._col);
  }

  sync(engine) {
    // Settled blocks
    const d = this.d;
    let i = 0;
    const s = this.settled;
    for (let z = 0; z < d.z; z++) {
      for (let y = 0; y < d.y; y++) {
        for (let x = 0; x < d.x; x++) {
          const v = engine.grid[idx(d, x, y, z)];
          if (v !== 0) {
            const hex = engine.colors[v - 1] ?? 0xffffff;
            this._setInstance(s, i, x, y, z, hex, 0.85);
            i++;
          }
        }
      }
    }
    s.count = i;
    s.instanceMatrix.needsUpdate = true;
    if (s.instanceColor) s.instanceColor.needsUpdate = true;

    // Active piece
    const a = this.active;
    let ai = 0;
    let zSum = 0;
    if (engine.piece && !engine.gameOver) {
      for (const [x, y, z] of engine.absCells(engine.piece.cells, engine.piece.pos)) {
        this._setInstance(a, ai, x, y, z, engine.piece.color, 1.3);
        zSum += z;
        ai++;
      }
      // Keep the camera framed on the falling piece.
      this.setFocusGameZ(zSum / ai);
    }
    a.count = ai;
    a.instanceMatrix.needsUpdate = true;
    if (a.instanceColor) a.instanceColor.needsUpdate = true;

    // Ghost (landing preview)
    const g = this.ghost;
    let gi = 0;
    if (engine.piece && !engine.gameOver) {
      const gp = engine.ghostPos();
      if (gp) {
        for (const [x, y, z] of engine.absCells(engine.piece.cells, gp)) {
          this._setInstance(g, gi, x, y, z, engine.piece.color, 1);
          gi++;
        }
      }
    }
    g.count = gi;
    g.instanceMatrix.needsUpdate = true;
    if (g.instanceColor) g.instanceColor.needsUpdate = true;
  }

  setViewMode(mode) {
    this.viewMode = mode;
  }

  rotateWorld(dir) {
    this.worldSteps = (this.worldSteps + dir + 4) % 4;
  }

  get worldRotationY() {
    return (this.worldSteps * Math.PI) / 2;
  }

  // Convert a screen swipe (dx, dy in pixels, y pointing down) into a dominant
  // game-plane move delta. Derived from the live camera orientation and the
  // current world rotation, so it always matches what the player sees.
  screenMove(sdx, sdy) {
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    // World-space direction of the swipe, flattened onto the ground plane.
    const dir = right.multiplyScalar(sdx).add(up.multiplyScalar(-sdy));
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) return [0, 0];
    dir.normalize();
    // Undo the world group's Y rotation to get the delta in game space (the
    // engine moves in game space; the group rotates it back for display).
    const t = this.world.rotation.y;
    const cos = Math.cos(t), sin = Math.sin(t);
    const gx = dir.x * cos - dir.z * sin; // game x axis  (three x)
    const gy = dir.x * sin + dir.z * cos; // game y axis  (three z)
    if (Math.abs(gx) >= Math.abs(gy)) return [gx > 0 ? 1 : -1, 0];
    return [0, gy > 0 ? 1 : -1];
  }

  // Compute the desired camera position/target for the current view mode,
  // framed around this.focusY (the height of the active piece).
  _applyCameraGoal(instant = false) {
    const H = this.d.z;
    const R = Math.max(this.d.x, this.d.y);
    const f = this.focusY;
    if (this.viewMode === 'top') {
      // Near-top-down with a slight tilt so the camera orientation (and thus
      // swipe-to-move mapping) stays well defined instead of degenerate.
      this._goalPos.set(0, f + R * 1.6, R * 0.42);
      this._goalTarget.set(0, f, 0);
    } else {
      // Angled view that keeps the active piece and the stack below it in frame.
      this._goalPos.set(0, f + H * 0.22, R * 1.5);
      this._goalTarget.set(0, f - H * 0.16, 0);
    }
    if (instant) {
      this.camera.position.copy(this._goalPos);
      this._camTarget.copy(this._goalTarget);
      this.camera.lookAt(this._camTarget);
    }
  }

  update(dt) {
    // Smoothly rotate the world group toward its target rotation.
    const targetY = this.worldRotationY;
    let cur = this.world.rotation.y;
    let diff = targetY - cur;
    // shortest path
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.world.rotation.y = cur + diff * Math.min(1, dt * 10);

    // Ease the framed height toward the active piece, then recompute the goal.
    const targetFocus = this._targetFocusY ?? this.focusY;
    this.focusY += (targetFocus - this.focusY) * Math.min(1, dt * 3);
    this._applyCameraGoal(false);

    this.camera.position.lerp(this._goalPos, Math.min(1, dt * 4));
    this._camTarget.lerp(this._goalTarget, Math.min(1, dt * 4));
    this.camera.lookAt(this._camTarget);
  }

  // Called by sync() with the active piece's average game-z height.
  setFocusGameZ(z) {
    this._targetFocusY = z - this.d.z / 2 + 0.5;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.renderer.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}
