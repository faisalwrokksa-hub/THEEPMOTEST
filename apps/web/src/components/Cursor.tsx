'use client';
import { useEffect } from 'react';

/**
 * The pointer treatment from the The EPMO site: a small filled dot that tracks
 * exactly, and a ring that lags behind it and swells over anything you can
 * click.
 *
 * Ported from that site's own runtime, including its easing — the ring moves
 * 16% of the remaining distance each frame, which is what gives it the weight.
 * Their copy is switched off by a `display:none` late in their stylesheet; this
 * one is on, because it is the thing being asked for.
 *
 * Only on a real pointer: a touch screen has nothing to follow, and a reader
 * who has asked for reduced motion should not be given a chasing ring.
 */
export function Cursor() {
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || still) return;

    const dot = document.createElement('i');
    const ring = document.createElement('i');
    dot.className = 'a360-cursor-dot';
    ring.className = 'a360-cursor-ring';
    document.body.append(dot, ring);

    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y;
    let raf = 0, shown = false;

    const move = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      if (!shown) { shown = true; dot.style.opacity = ring.style.opacity = '1'; }
      // Over something clickable the ring opens up. Checked per move rather
      // than bound per element, so it keeps working for anything rendered later.
      const over = (e.target as Element | null)?.closest?.('a,button,input,select,textarea,summary,[role=button]');
      document.body.classList.toggle('a360-cursor-active', Boolean(over));
    };

    const tick = () => {
      rx += (x - rx) * 0.16; ry += (y - ry) * 0.16;
      dot.style.transform = `translate3d(${x - 3}px,${y - 3}px,0)`;
      ring.style.transform = `translate3d(${rx - 17}px,${ry - 17}px,0)`;
      raf = requestAnimationFrame(tick);
    };

    const leave = () => { shown = false; dot.style.opacity = ring.style.opacity = '0'; };

    addEventListener('pointermove', move, { passive: true });
    document.addEventListener('mouseleave', leave);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', move);
      document.removeEventListener('mouseleave', leave);
      document.body.classList.remove('a360-cursor-active');
      dot.remove(); ring.remove();
    };
  }, []);

  return null;
}
