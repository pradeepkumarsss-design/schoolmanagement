// Small SVG charts drawn at the container's real pixel width, coloured from theme tokens.
import { useEffect, useRef, useState, type ReactNode } from 'react';

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || 600);
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Axis ticks at round steps (1, 2, 2.5 or 5 times a power of ten) covering 0..v. */
function niceTicks(v: number, target = 4): number[] {
  if (v <= 0) return [0, 1];
  const raw = v / target, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  const out: number[] = [];
  for (let t = 0; t < v + step - 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6);
  return out;
}
const topRound = (x: number, y: number, w: number, h: number, r: number) => {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

export interface Series { name: string; color: string }
export const S1 = 'var(--series-1)', S2 = 'var(--series-2)';

export function Legend({ series }: { series: Series[] }) {
  return <div className="legend">{series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>;
}

/** Vertical bars: one series, grouped, or stacked. */
export function Columns({ data, series, format = String, stacked, height = 220, max }: {
  data: { label: string; values: number[] }[]; series: Series[]; format?: (n: number) => string; stacked?: boolean; height?: number; max?: number;
}) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 46, r: 8, t: 10, b: 24 };
  const iw = Math.max(50, w - pad.l - pad.r), ih = height - pad.t - pad.b;
  const ticks = max ? [0, max / 4, max / 2, (max * 3) / 4, max] : niceTicks(Math.max(1, ...data.map(d => (stacked ? d.values.reduce((a, b) => a + b, 0) : Math.max(...d.values)))));
  const top = ticks[ticks.length - 1];
  const y = (v: number) => pad.t + ih - (v / top) * ih;
  const band = iw / Math.max(1, data.length);
  const groupW = Math.min(band * 0.7, stacked || series.length === 1 ? 28 : 44);
  const barW = stacked ? groupW : (groupW - (series.length - 1) * 2) / series.length;
  const every = Math.ceil((data.length * 34) / iw);
  return (
    <div className="stack tight">
      {series.length > 1 && <Legend series={series} />}
      <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
        <svg width={w} height={height} role="img" aria-label={series.map(s => s.name).join(' and ')}>
          {ticks.map(t => (
            <g key={t}><line className="grid-line" x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} /><text x={pad.l - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text></g>
          ))}
          {data.map((d, i) => {
            const x0 = pad.l + band * i + (band - groupW) / 2;
            let acc = 0;
            return (
              <g key={i} opacity={hover === null || hover === i ? 1 : 0.5}>
                {d.values.map((v, s) => {
                  if (v <= 0) return null;
                  const h = (v / top) * ih;
                  if (stacked) {
                    const yTop = y(acc + v); acc += v;
                    const last = d.values.slice(s + 1).every(n => n <= 0);
                    return last ? <path key={s} d={topRound(x0, yTop, barW, Math.max(1, h - (s ? 2 : 0)), 4)} fill={series[s].color} />
                      : <rect key={s} x={x0} y={yTop + (s ? 0 : 0)} width={barW} height={Math.max(1, h - (s ? 2 : 0))} fill={series[s].color} />;
                  }
                  return <path key={s} d={topRound(x0 + s * (barW + 2), y(v), barW, h, 4)} fill={series[s].color} />;
                })}
                {i % every === 0 && <text x={pad.l + band * i + band / 2} y={height - 6} textAnchor="middle">{d.label}</text>}
                <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
              </g>
            );
          })}
          <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeWidth={1} />
        </svg>
        {hover !== null && data[hover] && (
          <div className="tip" style={{ left: Math.min(w - 70, Math.max(70, pad.l + band * hover + band / 2)), top: pad.t + 4 }}>
            <b>{data[hover].label}</b>{series.map((s, k) => <div key={k}>{series.length > 1 ? `${s.name}: ` : ''}{format(data[hover].values[k])}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Single-series trend with an area fill and an emphasised last point. */
export function Trend({ points, format = String, height = 200, min = 0, max }: { points: { label: string; value: number }[]; format?: (n: number) => string; height?: number; min?: number; max?: number }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 44, r: 14, t: 12, b: 24 };
  const iw = Math.max(50, w - pad.l - pad.r), ih = height - pad.t - pad.b;
  if (!points.length) return <div className="empty">No data yet.</div>;
  const hi = max ?? niceTicks(Math.max(...points.map(p => p.value))).pop()!;
  const x = (i: number) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((Math.max(min, v) - min) / (hi - min || 1)) * ih;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join('');
  const every = Math.ceil((points.length * 44) / iw);
  const last = points.length - 1;
  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}
      onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(last, Math.round(((e.clientX - r.left - pad.l) / iw) * last)))); }}>
      <svg width={w} height={height} role="img" aria-label="Trend">
        {[0, 0.5, 1].map(t => { const v = min + (hi - min) * t; return <g key={t}><line className="grid-line" x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} /><text x={pad.l - 6} y={y(v) + 4} textAnchor="end">{format(v)}</text></g>; })}
        <path d={`${line}L${x(last)},${y(min)}L${x(0)},${y(min)}Z`} fill="var(--series-1)" opacity={0.12} />
        <path d={line} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => i % every === 0 && <text key={i} x={x(i)} y={height - 6} textAnchor="middle">{p.label}</text>)}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--muted)" strokeDasharray="3 3" />}
        <circle cx={x(hover ?? last)} cy={y(points[hover ?? last].value)} r={4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
      </svg>
      {hover !== null && <div className="tip" style={{ left: Math.min(w - 60, Math.max(60, x(hover))), top: y(points[hover].value) - 10 }}><b>{points[hover].label}</b> · {format(points[hover].value)}</div>}
    </div>
  );
}

/** Ranked horizontal bars with the value written beside each bar. */
export function HBars({ rows, max, format = String, onPick }: { rows: { id?: string; label: string; value: number; note?: ReactNode }[]; max?: number; format?: (n: number) => string; onPick?: (id: string) => void }) {
  const top = max ?? Math.max(1, ...rows.map(r => r.value));
  if (!rows.length) return <div className="empty">No data yet.</div>;
  return (
    <div className="hbar">
      {rows.map((r, i) => [
        onPick && r.id ? <button key={`l${i}`} className="btn ghost sm" style={{ justifyContent: 'flex-start', padding: 0, height: 'auto' }} onClick={() => onPick(r.id!)}>{r.label}</button> : <span key={`l${i}`}>{r.label}</span>,
        <div key={`t${i}`} className="track" title={`${r.label}: ${format(r.value)}`}><i style={{ width: `${Math.min(100, (r.value / top) * 100)}%` }} /></div>,
        <span key={`v${i}`} className="num" style={{ textAlign: 'right' }}>{format(r.value)}{r.note}</span>,
      ])}
    </div>
  );
}
