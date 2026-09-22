import { useMemo } from 'react';
import { Tile } from './ui';

// Center-out snake. Units: 1u = tile short side. Rows turn at ±LIM, right arm turns down, left arm turns up.
export function layoutSnake(chain, origin, LIM = 4.6) {
  const items = [];
  if (!chain || !chain.length) return { items, ends: null, bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 } };
  const o = chain[origin] || chain[0];
  const oi = chain[origin] ? origin : 0;
  const od = o.a === o.b;
  if (od) items.push({ idx: oi, x: -0.5, y: -1, w: 1, h: 2, orient: 'v', first: o.a, second: o.b });
  else items.push({ idx: oi, x: -1, y: -0.5, w: 2, h: 1, orient: 'h', first: o.a, second: o.b });
  const originRight = od ? 0.5 : 1;
  const originLeft = od ? -0.5 : -1;

  function arm(list, startX, dir, vdir) {
    let cx = startX;
    let rowY = 0;
    let d = dir;
    let afterTurn = false;
    let end = { x: od ? startX : startX - dir * 0.5, y: 0 };
    for (const { inV, outV, idx } of list) {
      const dbl = inV === outV;
      const perpendicular = dbl && !afterTurn;
      const len = perpendicular ? 1 : 2;
      const fits = d > 0 ? cx + len <= LIM : cx - len >= -LIM;
      if (!fits) {
        const x0 = d > 0 ? cx : cx - 1;
        if (vdir > 0) {
          const y0 = rowY - 0.5;
          items.push({ idx, x: x0, y: y0, w: 1, h: 2, orient: 'v', first: inV, second: outV });
          end = { x: x0 + 0.5, y: y0 + 1.5 };
          rowY += 2;
        } else {
          const y0 = rowY - 1.5;
          items.push({ idx, x: x0, y: y0, w: 1, h: 2, orient: 'v', first: outV, second: inV });
          end = { x: x0 + 0.5, y: y0 + 0.5 };
          rowY -= 2;
        }
        cx = d > 0 ? x0 + 1 : x0;
        d = -d;
        afterTurn = true;
        continue;
      }
      afterTurn = false;
      if (perpendicular) {
        const x0 = d > 0 ? cx : cx - 1;
        items.push({ idx, x: x0, y: rowY - 1, w: 1, h: 2, orient: 'v', first: inV, second: outV });
        end = { x: x0 + 0.5, y: rowY };
        cx = d > 0 ? cx + 1 : cx - 1;
      } else {
        const x0 = d > 0 ? cx : cx - 2;
        items.push({ idx, x: x0, y: rowY - 0.5, w: 2, h: 1, orient: 'h', first: d > 0 ? inV : outV, second: d > 0 ? outV : inV });
        end = { x: d > 0 ? x0 + 1.5 : x0 + 0.5, y: rowY };
        cx = d > 0 ? cx + 2 : cx - 2;
      }
    }
    return end;
  }
  const right = chain.slice(oi + 1).map((t, k) => ({ inV: t.a, outV: t.b, idx: oi + 1 + k }));
  const left = chain.slice(0, oi).map((t, k) => ({ inV: t.b, outV: t.a, idx: k })).reverse();
  const R = arm(right, originRight, 1, 1);
  const L = arm(left, originLeft, -1, -1);
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const it of items) {
    minX = Math.min(minX, it.x); maxX = Math.max(maxX, it.x + it.w);
    minY = Math.min(minY, it.y); maxY = Math.max(maxY, it.y + it.h);
  }
  return { items, ends: { L, R }, bounds: { minX: minX - 0.6, maxX: maxX + 0.6, minY: minY - 0.6, maxY: maxY + 0.6 } };
}

// Renders the snake centered inside a box (w×h px) with top/bottom insets
export function Snake({ chain, origin, ends, width, height, top = 0, bottom = 0, maxUnit = 32, highlight, onEnd, lastIdx, labels = true }) {
  const lay = useMemo(() => layoutSnake(chain, origin), [chain, origin]);
  const availW = width - 16;
  const availH = height - top - bottom - 8;
  const bw = lay.bounds.maxX - lay.bounds.minX;
  const bh = lay.bounds.maxY - lay.bounds.minY;
  const u = Math.max(12, Math.min(maxUnit, availW / Math.max(bw, 6), availH / Math.max(bh, 4)));
  const cx = width / 2 - ((lay.bounds.minX + lay.bounds.maxX) / 2) * u;
  const cy = top + availH / 2 + 4 - ((lay.bounds.minY + lay.bounds.maxY) / 2) * u;
  const pos = (p) => ({ left: cx + p.x * u, top: cy + p.y * u });
  const endVals = ends || [null, null];
  const endPts = lay.ends ? [{ side: 'L', p: lay.ends.L, v: endVals[0] }, { side: 'R', p: lay.ends.R, v: endVals[1] }] : [];
  return (
    <div className="snake" style={{ position: 'absolute', inset: 0 }}>
      {highlight && endPts.filter((e) => highlight.includes(e.side)).map((e) => {
        const c = pos(e.p);
        const r = Math.max(26, u * 1.1);
        return <button key={'g' + e.side} className="end-glow" aria-label={`Jogar na ponta ${e.v}`} onClick={() => onEnd?.(e.side)}
          style={{ left: c.left - r, top: c.top - r, width: r * 2, height: r * 2, border: 0 }} />;
      })}
      {lay.items.map((it) => (
        <div key={it.idx + ':' + chain[it.idx]?.a + chain[it.idx]?.b} style={{ position: 'absolute', ...pos(it), zIndex: 1 }}>
          <Tile a={it.first} b={it.second} u={u} orientation={it.orient}
            className={`placed ${it.idx === lastIdx ? 'flash' : ''}`}
            style={{ boxShadow: '0 0 0 1px rgba(212,160,23,0.3), 0 4px 9px rgba(0,0,0,0.5)' }} />
        </div>
      ))}
      {labels && endPts.map((e) => {
        const c = pos(e.p);
        const lx = e.side === 'L' ? -20 : 20;
        return <div key={'l' + e.side} className="end-label" style={{ left: Math.max(4, Math.min(width - 64, c.left + lx - 26)), top: c.top + (e.side === 'L' ? -u - 14 : u * 0.6) }}>Ponta {e.v}</div>;
      })}
    </div>
  );
}
