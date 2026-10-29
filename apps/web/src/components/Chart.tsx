/**
 * Charts drawn as SVG on the server.
 *
 * No charting library, and no client component. Three reasons, in order of
 * how much they matter: the board pack prints correctly because the chart is
 * real markup rather than something a script draws after load; a reader on a
 * slow connection sees the figures rather than an empty box; and the content
 * security policy stays closed, because nothing has to be fetched from a CDN.
 *
 * The cost is that there is no hover-and-explore. Native SVG <title> gives a
 * tooltip per point without a line of JavaScript, which covers the common
 * case — "what exactly is that number?" — and anything beyond it is a link to
 * the underlying rows, which is more useful than a floating card anyway.
 */

const PAD = { top: 14, right: 16, bottom: 30, left: 56 };

type Series = { key: string; label: string; colour: string; values: number[]; dashed?: boolean };

const nice = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(1)}B`
  : v >= 1e6 ? `${(v / 1e6).toFixed(0)}M`
  : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K`
  : String(Math.round(v));

/** Round a maximum up to something a human would label an axis with. */
function axisMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => v <= s * mag) ?? 10;
  return step * mag;
}

export function LineChart({ labels, series, height = 230, format = nice, caption }: {
  labels: string[];
  series: Series[];
  height?: number;
  format?: (v: number) => string;
  caption?: string;
}) {
  const w = 720, h = height;
  const iw = w - PAD.left - PAD.right;
  const ih = h - PAD.top - PAD.bottom;
  const max = axisMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const n = Math.max(labels.length, 2);

  const x = (i: number) => PAD.left + (i / (n - 1)) * iw;
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  // Enough labels to orient, not so many they overlap.
  const every = Math.max(1, Math.ceil(labels.length / 8));

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img"
           aria-label={caption ?? 'Line chart'} preserveAspectRatio="xMidYMid meet">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.left - 8} y={y(t) + 4} className="axis" textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => i % every === 0 && (
          <text key={i} x={x(i)} y={h - 10} className="axis" textAnchor="middle">{l}</text>
        ))}
        {series.map((s) => (
          <g key={s.key}>
            <polyline
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              fill="none" stroke={s.colour} strokeWidth="2.2"
              strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray={s.dashed ? '5 4' : undefined} />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r="2.6" fill={s.colour}>
                <title>{`${s.label} · ${labels[i]} · ${format(v)}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <figcaption className="legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.colour, ...(s.dashed ? { opacity: 0.55 } : {}) }} />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function BarChart({ labels, values, colour = 'var(--accent)', height = 190, format = nice,
                          caption, hrefs }: {
  labels: string[];
  values: number[];
  colour?: string;
  height?: number;
  format?: (v: number) => string;
  caption?: string;
  /** Makes each bar a link into the rows behind it. */
  hrefs?: (string | null)[];
}) {
  const w = 720, h = height;
  const iw = w - PAD.left - PAD.right;
  const ih = h - PAD.top - PAD.bottom;
  const max = axisMax(Math.max(1, ...values));
  const n = Math.max(values.length, 1);
  const slot = iw / n;
  const bw = Math.min(46, slot * 0.62);
  /* A value printed over a 14px bar collides with its neighbours and the
     chart becomes unreadable. Below that width the tooltip carries it. */
  const showValues = bw >= 26;

  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const every = Math.max(1, Math.ceil(labels.length / 10));

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img"
           aria-label={caption ?? 'Bar chart'} preserveAspectRatio="xMidYMid meet">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.left - 8} y={y(t) + 4} className="axis" textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {values.map((v, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          const bar = (
            <>
              <rect x={cx - bw / 2} y={y(v)} width={bw} height={Math.max(1, PAD.top + ih - y(v))}
                    rx="3" fill={colour} className="bar-rect">
                <title>{`${labels[i]} · ${format(v)}`}</title>
              </rect>
              {v > 0 && showValues && (
                <text x={cx} y={y(v) - 6} className="axis strong" textAnchor="middle">{format(v)}</text>
              )}
            </>
          );
          const href = hrefs?.[i];
          return (
            <g key={i}>
              {href ? <a href={href}>{bar}</a> : bar}
              {i % every === 0 && (
                <text x={cx} y={h - 10} className="axis" textAnchor="middle">{labels[i]}</text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** A stacked horizontal bar, each segment a link into the rows it counts. */
export function StackedBar({ segments, total }: {
  segments: { label: string; value: number; colour: string; href?: string }[];
  total?: number;
}) {
  const sum = (total ?? segments.reduce((a, s) => a + s.value, 0)) || 1;
  return (
    <div className="stackbar">
      <div className="track">
        {segments.filter((s) => s.value > 0).map((s) => {
          const seg = (
            <span className="seg" style={{ width: `${(s.value / sum) * 100}%`, background: s.colour }}
                  title={`${s.value} ${s.label}`} />
          );
          return s.href
            ? <a key={s.label} href={s.href} style={{ display: 'contents' }}>{seg}</a>
            : <span key={s.label} style={{ display: 'contents' }}>{seg}</span>;
        })}
      </div>
      <div className="legend">
        {segments.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.colour }} />
            {s.value} {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
