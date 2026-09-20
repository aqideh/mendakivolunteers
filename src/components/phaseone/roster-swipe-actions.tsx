"use client";

import { useEffect, useRef } from "react";

const REVEAL_DISTANCE = 152;
const OPEN_THRESHOLD = 64;
const INTERACTIVE_SELECTOR =
  "a, button, input, select, textarea, label, summary, [role='button']";
const SWIPE_EVENT = "keluarga:roster-swipe-open";

type SwipeAction = "review" | "insight";

function clampOffset(value: number) {
  return Math.max(0, Math.min(REVEAL_DISTANCE, value));
}

function readOffset(card: HTMLElement) {
  const value = card.style.getPropertyValue("--phaseone-swipe-x");
  return Number.parseFloat(value) || 0;
}

function setOffset(card: HTMLElement, value: number) {
  card.style.setProperty("--phaseone-swipe-x", `${clampOffset(value)}px`);
}

export function RosterSwipeActions() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const card = root?.closest<HTMLElement>(".phaseone-attendance-card");
    if (!root || !card) return;

    const mobile = window.matchMedia("(max-width: 760px)");
    let tracking = false;
    let dragging = false;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let startOffset = 0;

    const settle = (open: boolean) => {
      setOffset(card, open ? REVEAL_DISTANCE : 0);
      card.toggleAttribute("data-swipe-open", open);
      delete card.dataset.swipeDragging;
      tracking = false;
      dragging = false;
      pointerId = null;

      if (open) {
        document.dispatchEvent(
          new CustomEvent(SWIPE_EVENT, { detail: { cardId: card.id } }),
        );
      }
    };

    const syncMode = () => {
      if (mobile.matches) {
        card.dataset.swipeReady = "true";
        return;
      }

      delete card.dataset.swipeReady;
      delete card.dataset.swipeOpen;
      delete card.dataset.swipeDragging;
      card.style.removeProperty("--phaseone-swipe-x");
    };

    const onOtherCardOpen = (event: Event) => {
      const { cardId } = (event as CustomEvent<{ cardId?: string }>).detail ?? {};
      if (cardId && cardId !== card.id && card.hasAttribute("data-swipe-open")) {
        settle(false);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!mobile.matches || event.pointerType === "mouse") return;
      if (card.querySelector("details[open]")) return;

      const target = event.target;
      if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) return;

      tracking = true;
      dragging = false;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startOffset = readOffset(card);

      try {
        card.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is optional; the gesture still works without it.
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!tracking || pointerId !== event.pointerId) return;

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      if (!dragging) {
        if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;

        if (Math.abs(deltaY) >= Math.abs(deltaX)) {
          tracking = false;
          pointerId = null;
          return;
        }

        if (startOffset === 0 && deltaX < 0) {
          tracking = false;
          pointerId = null;
          return;
        }

        dragging = true;
        card.dataset.swipeDragging = "true";
      }

      event.preventDefault();
      setOffset(card, startOffset + deltaX);
    };

    const finishPointer = (event: PointerEvent) => {
      if (!tracking || pointerId !== event.pointerId) return;

      const shouldOpen = dragging && readOffset(card) >= OPEN_THRESHOLD;
      settle(shouldOpen);

      try {
        if (card.hasPointerCapture(event.pointerId)) {
          card.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Nothing to clean up.
      }
    };

    syncMode();
    mobile.addEventListener("change", syncMode);
    document.addEventListener(SWIPE_EVENT, onOtherCardOpen);
    card.addEventListener("pointerdown", onPointerDown);
    card.addEventListener("pointermove", onPointerMove);
    card.addEventListener("pointerup", finishPointer);
    card.addEventListener("pointercancel", finishPointer);

    return () => {
      mobile.removeEventListener("change", syncMode);
      document.removeEventListener(SWIPE_EVENT, onOtherCardOpen);
      card.removeEventListener("pointerdown", onPointerDown);
      card.removeEventListener("pointermove", onPointerMove);
      card.removeEventListener("pointerup", finishPointer);
      card.removeEventListener("pointercancel", finishPointer);
      delete card.dataset.swipeReady;
      delete card.dataset.swipeOpen;
      delete card.dataset.swipeDragging;
      card.style.removeProperty("--phaseone-swipe-x");
    };
  }, []);

  const openAction = (action: SwipeAction) => {
    const card = rootRef.current?.closest<HTMLElement>(".phaseone-attendance-card");
    if (!card) return;

    const selector =
      action === "review" ? ".phaseone-volunteer-review" : ".phaseone-inline-insight";
    const target = card.querySelector<HTMLDetailsElement>(selector);
    if (!target) return;

    card
      .querySelectorAll<HTMLDetailsElement>(
        ".phaseone-volunteer-review[open], .phaseone-inline-insight[open]",
      )
      .forEach((details) => {
        if (details !== target) details.open = false;
      });

    setOffset(card, 0);
    delete card.dataset.swipeOpen;
    target.open = true;

    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
      target.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
    });
  };

  return (
    <div
      aria-label="Volunteer card actions"
      className="phaseone-roster-swipe-actions"
      ref={rootRef}
      role="group"
    >
      <button
        aria-label="Review volunteer"
        className="phaseone-roster-swipe-action"
        onClick={() => openAction("review")}
        type="button"
      >
        <span className="phaseone-roster-swipe-icon" aria-hidden="true">★</span>
        <span>Review</span>
      </button>
      <button
        aria-label="Add volunteer insight"
        className="phaseone-roster-swipe-action"
        onClick={() => openAction("insight")}
        type="button"
      >
        <span className="phaseone-roster-swipe-icon" aria-hidden="true">+</span>
        <span>Insight</span>
      </button>
    </div>
  );
}
