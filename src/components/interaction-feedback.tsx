"use client";

import { useEffect, useState } from "react";

const FEEDBACK_DELAY_MS = 180;
const MAX_PENDING_MS = 30_000;

type PendingInteraction = {
  element: HTMLElement;
  previousAriaBusy: string | null;
  startedAt: number;
  delayTimer: number;
  maxTimer: number;
};

function isFeedbackMutationTarget(node: Node): boolean {
  const element =
    node instanceof Element ? node : node.parentElement;

  return Boolean(element?.closest("[data-interaction-feedback]"));
}

function shouldTrackLink(anchor: HTMLAnchorElement): boolean {
  if (
    anchor.target === "_blank" ||
    anchor.hasAttribute("download") ||
    anchor.getAttribute("aria-disabled") === "true"
  ) {
    return false;
  }

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) {
    return false;
  }

  try {
    const destination = new URL(anchor.href, window.location.href);
    if (destination.origin !== window.location.origin) {
      return false;
    }

    const current = new URL(window.location.href);
    return (
      destination.pathname !== current.pathname ||
      destination.search !== current.search
    );
  } catch {
    return false;
  }
}

export function InteractionFeedback() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let pending: PendingInteraction | null = null;

    function clearPending() {
      if (!pending) {
        setVisible(false);
        return;
      }

      window.clearTimeout(pending.delayTimer);
      window.clearTimeout(pending.maxTimer);
      pending.element.classList.remove("interaction-pending");

      if (pending.previousAriaBusy === null) {
        pending.element.removeAttribute("aria-busy");
      } else {
        pending.element.setAttribute("aria-busy", pending.previousAriaBusy);
      }

      pending = null;
      setVisible(false);
    }

    function beginPending(element: HTMLElement) {
      if (
        element.getAttribute("aria-disabled") === "true" ||
        (element instanceof HTMLButtonElement && element.disabled)
      ) {
        return;
      }

      clearPending();

      const interaction: PendingInteraction = {
        element,
        previousAriaBusy: element.getAttribute("aria-busy"),
        startedAt: Date.now(),
        delayTimer: 0,
        maxTimer: 0,
      };

      interaction.delayTimer = window.setTimeout(() => {
        if (pending !== interaction || !document.contains(element)) {
          return;
        }

        element.classList.add("interaction-pending");
        element.setAttribute("aria-busy", "true");
        setVisible(true);
      }, FEEDBACK_DELAY_MS);

      interaction.maxTimer = window.setTimeout(
        clearPending,
        MAX_PENDING_MS,
      );

      pending = interaction;
    }

    function handleSubmit(event: Event) {
      const submitEvent = event as SubmitEvent;
      const form = submitEvent.target;

      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      const submitter = submitEvent.submitter;
      if (submitter instanceof HTMLElement) {
        beginPending(submitter);
        return;
      }

      const fallback = form.querySelector<HTMLElement>(
        'button[type="submit"], button:not([type]), input[type="submit"]',
      );
      if (fallback) {
        beginPending(fallback);
      }
    }

    function handleClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const control = target.closest<HTMLElement>(
        'button, a.button, [role="button"]',
      );
      if (!control) {
        return;
      }

      if (control instanceof HTMLButtonElement) {
        const type = (control.getAttribute("type") ?? "submit").toLowerCase();

        if (type === "submit" && control.form) {
          return;
        }

        beginPending(control);
        return;
      }

      if (control instanceof HTMLAnchorElement && shouldTrackLink(control)) {
        beginPending(control);
        return;
      }

      if (control.getAttribute("role") === "button") {
        beginPending(control);
      }
    }

    const observer = new MutationObserver((mutations) => {
      if (!pending) {
        return;
      }

      const meaningfulMutation = mutations.some((mutation) => {
        if (isFeedbackMutationTarget(mutation.target)) {
          return false;
        }

        if (mutation.type === "characterData") {
          return true;
        }

        return (
          mutation.type === "childList" &&
          (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
        );
      });

      if (meaningfulMutation) {
        clearPending();
      }
    });

    document.addEventListener("submit", handleSubmit, true);
    document.addEventListener("click", handleClick, true);
    window.addEventListener("pageshow", clearPending);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      document.removeEventListener("submit", handleSubmit, true);
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("pageshow", clearPending);
      observer.disconnect();
      clearPending();
    };
  }, []);

  return (
    <div data-interaction-feedback>
      <div
        className={`interaction-progress${visible ? " is-visible" : ""}`}
        aria-hidden="true"
      />
      <span className="interaction-status" role="status" aria-live="polite">
        {visible ? "Working…" : ""}
      </span>
    </div>
  );
}
