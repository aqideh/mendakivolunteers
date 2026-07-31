"use client";

import { useEffect, useState } from "react";

export function getCountUpDisplayValue(value: number, progress: number): number {
  const boundedProgress = Math.min(Math.max(progress, 0), 1);
  const easedProgress = 1 - Math.pow(1 - boundedProgress, 3);
  return Math.round(value * easedProgress);
}

export function CountUpStat({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string | undefined;
}) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion || value <= 0) {
      const frame = requestAnimationFrame(() => {
        setDisplayValue(value);
      });
      return () => cancelAnimationFrame(frame);
    }

    const duration = 800;
    const startedAt = performance.now();
    let frame = 0;

    const animate = (now: number) => {
      const progress = (now - startedAt) / duration;
      setDisplayValue(getCountUpDisplayValue(value, progress));

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <article className={className} aria-label={`${value} ${label}`}>
      <strong aria-hidden="true">{displayValue}</strong>
      <span>{label}</span>
    </article>
  );
}
