export default function Loading() {
  return (
    <div className="site-shell loading-shell" role="status" aria-live="polite">
      <div className="app-loading">
        <div className="loading-mark" aria-hidden="true">
          K
        </div>
        <div>
          <strong>Loading KELUARGA</strong>
          <div className="loading-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}
