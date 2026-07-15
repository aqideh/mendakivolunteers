import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";

const foundations = [
  {
    title: "Secure identity boundary",
    body: "Supabase Auth identities remain separate from the authoritative YM Hub volunteer identifier until a controlled link is made.",
  },
  {
    title: "App-owned content",
    body: "Opportunity discovery and volunteer news are managed in the portal without taking ownership of YM Hub registration records.",
  },
  {
    title: "Database-enforced access",
    body: "Role checks, row-level security, immutable revisions, and server-only integration credentials are enforced below the interface.",
  },
];

export default function Home() {
  return (
    <div className="site-shell">
      <PortalHeader status="Volunteer portal" />

      <main className="page-frame">
        <section className="hero">
          <div>
            <p className="eyebrow">MENDAKI volunteer web portal</p>
            <h1>A secure engagement layer for volunteers.</h1>
            <p className="lede">
              Browse opportunities and volunteer news in this portal. Official
              registration, attendance verification, and verified hours remain
              in YM Hub.
            </p>
            <div className="actions">
              <Link className="button button-primary" href="/opportunities">
                Browse opportunities
              </Link>
              <Link className="button button-secondary" href="/news">
                Read volunteer news
              </Link>
              <Link className="button button-secondary" href="/login">
                Volunteer sign in
              </Link>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="available-title">
          <p className="eyebrow">Available services</p>
          <h2 id="available-title">Volunteer content and secure account access</h2>
          <div className="card-grid">
            <article className="card">
              <h3>Opportunity discovery</h3>
              <p className="muted">
                App-managed listings provide clear descriptions and link to the
                official YM Hub registration destination.
              </p>
              <Link className="text-link" href="/opportunities">
                View opportunities
              </Link>
            </article>
            <article className="card">
              <h3>Volunteer news</h3>
              <p className="muted">
                Staff-managed updates and announcements are published separately
                from volunteer records in YM Hub.
              </p>
              <Link className="text-link" href="/news">
                View news
              </Link>
            </article>
            <article className="card">
              <h3>Authenticated dashboard</h3>
              <p className="muted">
                Supabase authentication and row-level policies isolate volunteer
                accounts and staff permissions.
              </p>
              <Link className="text-link" href="/dashboard">
                Open dashboard
              </Link>
            </article>
          </div>
        </section>

        <section className="section" id="foundation">
          <p className="eyebrow">Platform principles</p>
          <h2>Designed to supplement YM Hub</h2>
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
        Official registration, attendance verification, and verified hours remain
        in YM Hub.
      </footer>
    </div>
  );
}
