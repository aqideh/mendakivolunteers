import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="page-frame narrow-frame" tabIndex={-1}>
      <section className="panel">
        <h1>Page not found</h1>
        <p className="muted">
          The page may have moved or the link may no longer be available.
          You can browse current volunteering opportunities instead.
        </p>
        <div className="actions">
          <Link className="button button-primary" href="/opportunities">
            View opportunities
          </Link>
          <Link className="button button-secondary" href="/">
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}
