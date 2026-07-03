import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Engine, DEFAULT_DIMS } from './game/engine.js';
import { Renderer } from './three/renderer.js';

// Rotate a horizontal (dx, dy) delta by the world's rotation so that on-screen
// directions map to the correct world-space movement.
function rotateDelta(dx, dy, steps) {
  switch (((steps % 4) + 4) % 4) {
    case 1: return [dy, -dx];
    case 2: return [-dx, -dy];
    case 3: return [-dy, dx];
    default: return [dx, dy];
  }
}

export default function App() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const rendererRef = useRef(null);
  const [hud, setHud] = useState({ score: 0, lines: 0, gameOver: false, next: '' });
  const [view, setView] = useState('iso');

  // Keep a mutable "dirty" flag so we only rebuild HUD state when it changes.
  const syncHud = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    setHud((h) => {
      if (h.score === e.score && h.lines === e.lines && h.gameOver === e.gameOver && h.next === e.next?.name) {
        return h;
      }
      return { score: e.score, lines: e.lines, gameOver: e.gameOver, next: e.next?.name ?? '' };
    });
  }, []);

  // ---- Control actions ----
  const moveScreen = useCallback((dir) => {
    const e = engineRef.current, r = rendererRef.current;
    if (!e || !r) return;
    const base = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }[dir];
    const [dx, dy] = rotateDelta(base[0], base[1], r.worldSteps);
    e.move(dx, dy, 0);
  }, []);

  const rotatePiece = useCallback((axis, times = 1) => {
    const e = engineRef.current;
    if (!e) return;
    for (let i = 0; i < times; i++) e.rotate(axis);
  }, []);

  // The axis that appears horizontal-into-screen depends on world rotation.
  const screenRotateAxis = useCallback(() => {
    const r = rendererRef.current;
    return r && r.worldSteps % 2 === 1 ? 'y' : 'x';
  }, []);

  const rotateWorld = useCallback((dir) => {
    rendererRef.current?.rotateWorld(dir);
  }, []);

  const hardDrop = useCallback(() => {
    engineRef.current?.hardDrop();
    syncHud();
  }, [syncHud]);

  const softDrop = useCallback(() => {
    engineRef.current?.move(0, 0, -1);
  }, []);

  const applyView = useCallback((mode) => {
    setView((v) => {
      if (v !== mode) rendererRef.current?.setViewMode(mode);
      return mode;
    });
  }, []);

  const toggleView = useCallback(() => {
    setView((v) => {
      const nv = v === 'iso' ? 'top' : 'iso';
      rendererRef.current?.setViewMode(nv);
      return nv;
    });
  }, []);

  const restart = useCallback(() => {
    engineRef.current = new Engine(DEFAULT_DIMS);
    syncHud();
  }, [syncHud]);

  // ---- Setup engine, renderer, game loop ----
  useEffect(() => {
    const engine = new Engine(DEFAULT_DIMS);
    const renderer = new Renderer(canvasRef.current, DEFAULT_DIMS);
    engineRef.current = engine;
    rendererRef.current = renderer;

    let raf;
    let last = performance.now();
    let acc = 0;

    const loop = (now) => {
      const dtMs = Math.min(100, now - last);
      last = now;
      const dt = dtMs / 1000;
      const e = engineRef.current;
      if (e && !e.gameOver) {
        acc += dtMs;
        if (acc >= e.dropInterval()) {
          acc = 0;
          e.step();
          syncHud();
        }
      }
      renderer.sync(engineRef.current);
      renderer.update(dt);
      renderer.render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    // ---- Keyboard controls (desktop) ----
    const onKey = (ev) => {
      const e = engineRef.current, r = rendererRef.current;
      if (!e || !r) return;
      let handled = true;
      switch (ev.key) {
        case 'ArrowLeft': moveScreen('left'); break;
        case 'ArrowRight': moveScreen('right'); break;
        case 'ArrowUp': moveScreen('up'); break;
        case 'ArrowDown': moveScreen('down'); break;
        case ' ': hardDrop(); break;
        case 'Shift': softDrop(); break;
        case 'q': rotatePiece('x'); break;
        case 'a': rotatePiece('x', 3); break;
        case 'w': rotatePiece('y'); break;
        case 's': rotatePiece('y', 3); break;
        case 'e': rotatePiece('z'); break;
        case 'd': rotatePiece('z', 3); break;
        case 'z': rotateWorld(-1); break;
        case 'x': rotateWorld(1); break;
        case 'v': toggleView(); break;
        default: handled = false;
      }
      if (handled) ev.preventDefault();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.removeEventListener('keydown', onKey);
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Touch swipe handling on the canvas ----
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    let sx = 0, sy = 0, st = 0;
    let longTimer = null, longFired = false;
    let fsTried = false;

    const clearLong = () => { if (longTimer) { clearTimeout(longTimer); longTimer = null; } };

    // Enter real fullscreen on the first interaction (Android/desktop; iOS
    // Safari ignores this — use "Add to Home Screen" there instead).
    const enterFullscreen = () => {
      if (fsTried) return;
      fsTried = true;
      const doc = document.documentElement;
      const req = doc.requestFullscreen || doc.webkitRequestFullscreen;
      if (req && !document.fullscreenElement) {
        try { req.call(doc).catch(() => {}); } catch (_) { /* not supported */ }
      }
    };

    const start = (t) => {
      sx = t.clientX; sy = t.clientY; st = performance.now();
      longFired = false;
      clearLong();
      // Long press acts like Space: hard drop.
      longTimer = setTimeout(() => {
        longFired = true;
        hardDrop();
      }, 450);
    };
    const moveCancel = (t) => {
      // If the finger travels, it's a swipe — cancel the pending long press.
      if (Math.abs(t.clientX - sx) > 12 || Math.abs(t.clientY - sy) > 12) clearLong();
    };
    const end = (t) => {
      clearLong();
      if (longFired) return; // already hard-dropped; don't also rotate/move
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      const dist = Math.max(adx, ady);
      const r = rendererRef.current;
      if (!r) return;
      if (dist < 24) {
        // Tap: rotate the piece.
        rotatePiece(screenRotateAxis());
        syncHud();
        return;
      }
      if (r.viewMode === 'top') {
        // Top-down: any swipe moves the piece, mapped to the on-screen direction.
        const [gdx, gdy] = r.screenMove(dx, dy);
        engineRef.current?.move(gdx, gdy, 0);
      } else if (adx > ady) {
        // 3D view: horizontal swipe rotates the world.
        rotateWorld(dx > 0 ? 1 : -1);
      } else {
        // 3D view: vertical swipe moves the piece toward/away on screen.
        const [gdx, gdy] = r.screenMove(dx, dy);
        engineRef.current?.move(gdx, gdy, 0);
      }
      syncHud();
    };

    const onTouchStart = (ev) => {
      enterFullscreen();
      if (ev.touches.length >= 2) {
        // Two-finger tap toggles the view (mobile has no scroll wheel).
        clearLong();
        longFired = true; // suppress the follow-up touchend action
        toggleView();
        return;
      }
      if (ev.touches.length === 1) start(ev.touches[0]);
    };
    const onTouchMove = (ev) => { if (ev.touches.length) moveCancel(ev.touches[0]); };
    const onTouchEnd = (ev) => { if (ev.changedTouches.length) end(ev.changedTouches[0]); };
    const onTouchCancel = () => { clearLong(); };
    const onMouseDown = (ev) => { enterFullscreen(); start(ev); };
    const onMouseMove = (ev) => { if (longTimer) moveCancel(ev); };
    const onMouseUp = (ev) => end(ev);
    // Scroll down -> top view, scroll up -> 3D view.
    const onWheel = (ev) => {
      if (ev.deltaY > 0) applyView('top');
      else if (ev.deltaY < 0) applyView('iso');
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('mouseup', onMouseUp);
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      clearLong();
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [rotateWorld, rotatePiece, screenRotateAxis, syncHud, applyView, hardDrop, toggleView]);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="scene" />

      <div className="hud">
        <div className="stat"><span>SCORE</span><b>{hud.score}</b></div>
        <div className="stat"><span>LINES</span><b>{hud.lines}</b></div>
        <div className="stat"><span>NEXT</span><b>{hud.next}</b></div>
      </div>

      <div className="hint">
        {view === 'iso'
          ? 'Tap rotate · Swipe ⇅ move · Swipe ⇆ rotate world · Hold drop · 2-finger: top'
          : 'Tap rotate · Swipe to move · Hold drop · 2-finger: 3D view'}
      </div>

      {hud.gameOver && (
        <div className="overlay" onClick={restart}>
          <div className="panel">
            <h1>Game Over</h1>
            <p>Score {hud.score} · Lines {hud.lines}</p>
            <p className="tapAgain">Tap to play again</p>
          </div>
        </div>
      )}
    </div>
  );
}
