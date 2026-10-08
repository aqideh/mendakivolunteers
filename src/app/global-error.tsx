"use client";

export default function GlobalError({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "clamp(1.5rem, 5vw, 4rem)", background: "#f7f7f4", color: "#373A36" }}>
        <main id="main-content" tabIndex={-1} style={{ maxWidth: "36rem", margin: "6rem auto" }}>
          <h1>Something went wrong</h1>
          <p>We could not load Keluarga MENDAKI. Try again, or contact the Volunteer Management team if the problem continues.</p>
          <button onClick={reset} style={{ minHeight: 44, padding: "0.65rem 1rem", background: "#FFD700", color: "#373A36", border: "2px solid #373A36", borderRadius: 8, cursor: "pointer" }}>
            Try again
          </button>
          <p><a href="mailto:volunteer@mendaki.org.sg">Contact the volunteer team</a></p>
        </main>
      </body>
    </html>
  );
}
