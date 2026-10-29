export default function NotFound() {
  return (
    <div className="authwrap" style={{ gridTemplateColumns: '1fr' }}>
      <div className="authpanel" style={{ maxWidth: 'none', justifyItems: 'center', textAlign: 'center' }}>
        <span className="tag">404</span>
        <h1 style={{ marginBlock: '16px 8px' }}>That page does not exist</h1>
        <p className="dim" style={{ maxWidth: '46ch' }}>
          The link may be out of date, or the module may not be part of your workspace.
        </p>
        <a className="btn" href="/" style={{ marginBlockStart: 18 }}>Back to overview</a>
      </div>
    </div>
  );
}
