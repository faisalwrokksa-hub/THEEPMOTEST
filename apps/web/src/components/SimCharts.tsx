import type { T } from '@pmo/contracts';

/**
 * The two panels the The EPMO site shows on its executive view.
 *
 * Markup, class names, geometry and colours are taken from that site's own
 * stylesheet rather than approximated — a 700×260 viewBox, four gridlines, an
 * area under the line, points on every reading, and a donut built from a
 * conic-gradient with the count punched out of the middle.
 *
 * Drawn as plain SVG on the server. No chart library: these are two shapes,
 * a library would be larger than the whole page, and server-rendered SVG is
 * the only kind that survives printing to a PDF.
 */

/** A month's worth of the cumulative curve. */
export type TrendPoint = { period: string; planned: number; actual: number };

const VB_W = 700, VB_H = 260, PAD_L = 40, PAD_R = 20, TOP = 30, BASE = 220;

export function TrendPanel({ t, points, eyebrow, title, note }:
  { t: T; points: TrendPoint[]; eyebrow: string; title: string; note?: string }) {
  // Two readings cannot show a trend, and a line drawn through them implies
  // one. The panel says so instead of drawing it.
  if (points.length < 3) {
    return (
      <section className="simpanel">
        <div className="simpanel-head">
          <div><small>{t(eyebrow)}</small><h3>{t(title)}</h3></div>
        </div>
        <p className="dim" style={{ margin: '18px 0 4px' }}>
          {t('Not enough history yet to draw a trend.')}
        </p>
      </section>
    );
  }

  const peak = Math.max(...points.map((p) => Math.max(p.planned, p.actual)), 1);
  const x = (i: number) => PAD_L + (i * (VB_W - PAD_L - PAD_R)) / (points.length - 1);
  const y = (v: number) => TOP + (1 - v / peak) * (BASE - TOP);
  const line = points.map((p, i) => `${x(i)},${y(p.actual)}`).join(' ');
  const area = `M ${points.map((p, i) => `${x(i)},${y(p.actual)}`).join(' L ')} L ${x(points.length - 1)} ${BASE} L ${PAD_L} ${BASE} Z`;
  const plan = points.map((p, i) => `${x(i)},${y(p.planned)}`).join(' ');

  return (
    <section className="simpanel">
      <div className="simpanel-head">
        <div><small>{t(eyebrow)}</small><h3>{t(title)}</h3></div>
        {note && <span>{t(note)}</span>}
      </div>
      <svg className="simchart" viewBox={`0 0 ${VB_W} ${VB_H}`} role="img"
           aria-label={t(title)} preserveAspectRatio="none">
        <g className="simgrid">
          {[40, 95, 150, 205].map((gy) => (
            <line key={gy} x1={PAD_L} y1={gy} x2={VB_W - PAD_R} y2={gy} />
          ))}
        </g>
        <path className="simarea" d={area} />
        <polyline className="simplan" points={plan} />
        <polyline className="simline" points={line} />
        <g className="simpoints">
          {points.map((p, i) => <circle key={p.period} cx={x(i)} cy={y(p.actual)} r="4" />)}
        </g>
      </svg>
      <div className="simlegend">
        <span><i className="is-line" />{t('Spent to date')}</span>
        <span><i className="is-target" />{t('Planned')}</span>
      </div>
    </section>
  );
}

export function HealthDonut({ t, onTrack, atRisk, critical, eyebrow, title }:
  { t: T; onTrack: number; atRisk: number; critical: number; eyebrow: string; title: string }) {
  const total = onTrack + atRisk + critical;
  // Degrees rather than percentages, because a conic-gradient takes degrees
  // and rounding twice is how a slice ends up one pixel short of closing.
  const deg = (n: number) => (total ? (n / total) * 360 : 0);
  const a = deg(onTrack), b = a + deg(atRisk);
  const ring = total
    ? `conic-gradient(var(--good) 0deg ${a}deg, var(--warn) ${a}deg ${b}deg, var(--crit) ${b}deg 360deg)`
    : 'conic-gradient(var(--line-2) 0deg 360deg)';

  return (
    <section className="simpanel">
      <div className="simpanel-head">
        <div><small>{t(eyebrow)}</small><h3>{t(title)}</h3></div>
      </div>
      <div className="simdonut-wrap">
        <div className="simdonut" style={{ background: ring }}
             role="img" aria-label={`${onTrack} ${t('on track')}, ${atRisk} ${t('at risk')}, ${critical} ${t('critical')}`}>
          <span>{total}</span><small>{t('projects')}</small>
        </div>
      </div>
      <div className="simstatus">
        <span><i className="green" />{t('On track')}<b>{onTrack}</b></span>
        <span><i className="amber" />{t('At risk')}<b>{atRisk}</b></span>
        <span><i className="red" />{t('Critical')}<b>{critical}</b></span>
      </div>
    </section>
  );
}
