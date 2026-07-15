"use client";

import { useEffect } from "react";

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
    <main className="page-frame narrow-frame">
      <section className="panel" role="alert">
        <p className="eyebrow">Service unavailable</p>
        <h1>This page could not be loaded.</h1>
        <p className="muted">
          No substitute or cached data has been shown. Try the request again after
          the service recovers.
        </p>
        <button className="button button-primary" onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
