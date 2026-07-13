import Link from "next/link";

const foundations = [
  {
    title: "Secure identity boundary",
    body: "Supabase Auth identities remain separate from the authoritative YM Hub volunteer identifier until a controlled link is made.",
  },
  {
    title: "Replaceable YM Hub gateway",
    body: "Application code uses canonical volunteer fields. Placeholder Salesforce labels are isolated to one adapter configuration.",
  },
  {
    title: "Database-enforced access",
    body: "Role checks, row-level security, immutable audit records, and server-only integration credentials are built into the foundation.",
  },
];

export default function Home() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark" aria-hidden="true">
            MV
          </span>
          <span>MENDAKI Volunteer Portal</span>
        </Link>
        <p className="header-status">Phase 1 foundation build</p>
      </header>

      <main className="page-frame">
        <section className="hero">
          <div>
            <p className="eyebrow">Web application prototype</p>
            <h1>A secure engagement layer for volunteers.</h1>
            <p className="lede">
              This application supplements YM Hub. It does not replace the CRM,
              official registration records, or verified attendance records.
            </p>
            <div className="actions">
              <Link className="button button-primary" href="/login">
                Volunteer sign in
              </Link>
              <a className="button button-secondary" href="#foundation">
                Review foundation
              </a>
            </div>
          </div>

          <aside className="panel prototype-card" aria-labelledby="prototype-title">
            <p className="eyebrow">Development data</p>
            <h2 id="prototype-title">Mock YM Hub identity</h2>
            <p className="prototype-id">PROTO-VOL-000001</p>
            <p className="muted">
              Prototype identifiers are limited to development and staging.
              Production configuration rejects mock mode and placeholder field
              mappings.
            </p>
          </aside>
        </section>

        <section className="section" id="foundation">
          <p className="eyebrow">Phase 1 scope</p>
          <h2>Platform and identity foundations</h2>
          <div className="card-grid">
            {foundations.map((foundation) => (
              <article className="card" key={foundation.title}>
                <h3>{foundation.title}</h3>
                <p className="muted">{foundation.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        Prototype environment. Do not use prototype identifiers in production.
      </footer>
    </div>
  );
}
