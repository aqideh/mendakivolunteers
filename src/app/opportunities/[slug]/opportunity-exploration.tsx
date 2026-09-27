"use client";

import { useEffect } from "react";

export function OpportunityExploration({ slug }: { slug: string }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/recognition/opportunity-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [slug]);
  return null;
}
