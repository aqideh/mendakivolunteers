"use client";

import { useEffect } from "react";
import Link from "next/link";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("Application route failed", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <main id="main-content" className="page-frame narrow-frame" tabIndex={-1}>
      <section className="panel" role="alert">
        
        <h1>This page could not be loaded.</h1>
        <p className="muted">
          Try again. If the problem continues, contact the Volunteer Management team.
        </p>
        <button className="button button-primary" onClick={reset} type="button">
          Try again
        </button>
        <div className="actions"><Link className="text-link" href="/opportunities">View opportunities</Link><a className="text-link" href="mailto:volunteer@mendaki.org.sg">Contact the volunteer team</a></div>
      </section>
    </main>
  );
}
