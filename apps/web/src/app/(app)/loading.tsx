import { tr } from '@/lib/i18n';
/** Shown while a server component fetches. Mirrors the real layout so the
 *  page does not jump when data arrives. */
export default async function Loading() {
  const t = await tr();
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="skel" style={{ width: 260, height: 26, marginBottom: 10 }} />
      <div className="skel" style={{ width: 460, height: 14, marginBottom: 28 }} />
      <div className="skel-tiles">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="skel-tile" key={i}>
            <div className="skel" style={{ width: '55%', height: 9 }} />
            <div className="skel" style={{ width: '40%', height: 26 }} />
            <div className="skel" style={{ width: '75%', height: 9 }} />
          </div>
        ))}
      </div>
      <div className="skel-rows">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}><div className="skel" style={{ width: `${88 - i * 7}%` }} /></div>
        ))}
      </div>
      <span className="visually-hidden">{t('Loading…')}</span>
    </div>
  );
}
