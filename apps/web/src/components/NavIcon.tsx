/**
 * One icon per navigation item.
 *
 * Twenty-seven items in seven groups is a wall of text to scan, and the rail
 * is the thing a user reads most often. Icons give each destination a shape,
 * which is what makes a collapsed rail possible at all — and the collapsed
 * rail is what buys back 244px on a screen showing a Gantt.
 *
 * Drawn here rather than pulled from a library: twenty-seven 16px glyphs are
 * smaller than the dependency, they inherit currentColor so they theme and
 * mirror for free, and nothing needs fetching from a CDN.
 */
const P: Record<string, React.ReactNode> = {
  'executive-overview': <><path d="M2 12.5h12" /><path d="M4 12.5V7" /><path d="M7.3 12.5V3.5" /><path d="M10.7 12.5V9" /><path d="M14 12.5V5.5" /></>,
  'my-work': <><path d="M8 2.2v3" /><rect x="2.5" y="5.2" width="11" height="8.3" rx="1.6" /><path d="M5.8 8.6l1.5 1.5 2.9-2.9" /></>,
  attention: <><path d="M8 2.4l6 10.4H2z" /><path d="M8 6.6v3" /><path d="M8 11.3h.01" /></>,
  portfolios: <><rect x="2.2" y="4.6" width="11.6" height="8.6" rx="1.6" /><path d="M5.6 4.6V3.4a1 1 0 011-1h2.8a1 1 0 011 1v1.2" /><path d="M2.2 8.4h11.6" /></>,
  projects: <><rect x="2.4" y="2.6" width="11.2" height="11" rx="1.8" /><path d="M5.3 6.2h5.4" /><path d="M5.3 9h3.6" /></>,
  'work-board': <><rect x="2.2" y="3" width="3.6" height="10.2" rx="1.1" /><rect x="6.9" y="3" width="3.6" height="6.6" rx="1.1" /><rect x="11.6" y="3" width="2.2" height="8.4" rx="1.1" /></>,
  schedule: <><path d="M2.4 4.4h5.8" /><path d="M5.2 8h8.4" /><path d="M3.6 11.6h6.6" /><circle cx="9.4" cy="4.4" r="1.5" /><circle cx="3.4" cy="8" r="1.5" /><circle cx="11.8" cy="11.6" r="1.5" /></>,
  'stage-gates': <><path d="M2.4 8h11.2" /><circle cx="4.2" cy="8" r="1.7" /><circle cx="8" cy="8" r="1.7" /><circle cx="11.8" cy="8" r="1.7" /><path d="M8 3.4v2.9" /></>,
  raid: <><path d="M8 2.2l5.4 3v4.2c0 2.4-2.2 4-5.4 4.4-3.2-.4-5.4-2-5.4-4.4V5.2z" /><path d="M8 6v2.6" /><path d="M8 10.6h.01" /></>,
  decisions: <><path d="M8 2.4v11.2" /><path d="M3.2 6.2h9.6" /><path d="M3.2 6.2L1.9 9.6h2.6z" /><path d="M12.8 6.2l-1.3 3.4h2.6z" /></>,
  approvals: <><path d="M3 8.4l3 3 7-7.2" /><path d="M13 9.4v2.8a1.4 1.4 0 01-1.4 1.4H4.4A1.4 1.4 0 013 12.2V4.6" /></>,
  analytics: <><circle cx="8" cy="8" r="5.6" /><path d="M8 2.4V8l3.9 3.9" /></>,
  financials: <><circle cx="8" cy="8" r="5.6" /><path d="M9.8 6.1c-.4-.6-1.1-.9-1.9-.9-1.1 0-1.8.5-1.8 1.3 0 2 3.8.9 3.8 3 0 .9-.8 1.5-2 1.5-.9 0-1.7-.4-2-1" /><path d="M8 4.3v7.4" /></>,
  benefits: <><path d="M2.6 11.4l3.3-3.6 2.5 2.1 4.9-5.3" /><path d="M10.4 4.6h2.9v2.9" /></>,
  resources: <><circle cx="6" cy="5.6" r="2.3" /><path d="M2.2 13.2c0-2.1 1.7-3.5 3.8-3.5s3.8 1.4 3.8 3.5" /><path d="M11 5.1a2.1 2.1 0 010 4" /><path d="M12.3 13.2c0-1.7-.7-2.8-1.9-3.3" /></>,
  notifications: <><path d="M8 2.6a3.9 3.9 0 00-3.9 3.9c0 3.5-1.3 4.6-1.3 4.6h10.4s-1.3-1.1-1.3-4.6A3.9 3.9 0 008 2.6z" /><path d="M9.3 13.4a1.5 1.5 0 01-2.6 0" /></>,
  data: <><ellipse cx="8" cy="4.2" rx="5.2" ry="1.9" /><path d="M2.8 4.2v7.6c0 1 2.3 1.9 5.2 1.9s5.2-.9 5.2-1.9V4.2" /><path d="M2.8 8c0 1 2.3 1.9 5.2 1.9s5.2-.9 5.2-1.9" /></>,
  reports: <><path d="M4 2.6h5l3.2 3.2v7.6a.9.9 0 01-.9.9H4a.9.9 0 01-.9-.9V3.5a.9.9 0 01.9-.9z" /><path d="M8.8 2.6v3.4h3.4" /><path d="M5.6 9.6h4.8" /><path d="M5.6 11.6h3" /></>,
  documents: <><path d="M3.4 3.4h4l1.2 1.6h4a.9.9 0 01.9.9v6.7a.9.9 0 01-.9.9H3.4a.9.9 0 01-.9-.9V4.3a.9.9 0 01.9-.9z" /></>,
  updates: <><path d="M3 3.4h10a.9.9 0 01.9.9v5.9a.9.9 0 01-.9.9H6.6L3.6 13V4.3A.9.9 0 014.5 3.4z" /><path d="M5.8 6.2h4.6" /><path d="M5.8 8.4h2.8" /></>,
  stakeholders: <><circle cx="8" cy="8" r="5.6" /><circle cx="8" cy="8" r="2.1" /><path d="M8 2.4v3.5" /><path d="M8 10.1v3.5" /><path d="M2.4 8h3.5" /><path d="M10.1 8h3.5" /></>,
  studio: <><path d="M6.4 2.9l-.3 1.6a4.6 4.6 0 00-1.2.7L3.4 4.6 2.2 6.7l1.2 1a4.6 4.6 0 000 1.4l-1.2 1 1.2 2.1 1.5-.6c.37.3.78.53 1.2.7l.3 1.6h2.4l.3-1.6c.42-.17.83-.4 1.2-.7l1.5.6 1.2-2.1-1.2-1a4.6 4.6 0 000-1.4l1.2-1-1.2-2.1-1.5.6a4.6 4.6 0 00-1.2-.7l-.3-1.6z" /><circle cx="8" cy="8" r="1.7" /></>,
  integrations: <><path d="M6.3 9.7L4.6 11.4a2.4 2.4 0 003.4 3.4l1.7-1.7" transform="translate(0,-2.4)" /><path d="M9.7 6.3l1.7-1.7a2.4 2.4 0 00-3.4-3.4L6.3 2.9" transform="translate(0,2.4)" /><path d="M6.2 9.8l3.6-3.6" /></>,
  'workspace-settings': <><rect x="2.4" y="2.6" width="11.2" height="11" rx="2" /><path d="M2.4 6.2h11.2" /><path d="M6 6.2v7.4" /></>,
  platform: <><rect x="2.3" y="2.3" width="5" height="5" rx="1.3" /><rect x="8.7" y="2.3" width="5" height="5" rx="1.3" /><rect x="2.3" y="8.7" width="5" height="5" rx="1.3" /><rect x="8.7" y="8.7" width="5" height="5" rx="1.3" /></>,
};

export function NavIcon({ k }: { k: string }) {
  const d = P[k];
  if (!d) return <span className="ico" aria-hidden="true" />;
  return (
    <svg className="ico" viewBox="0 0 16 16" aria-hidden="true" fill="none"
         stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}
