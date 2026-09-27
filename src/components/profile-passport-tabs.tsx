"use client";

import { useEffect, useState } from "react";

export type ProfilePassportTab = "overview" | "activity" | "recognition";

type ProfilePassportTabsProps = Readonly<{
  initialTab: ProfilePassportTab;
}>;

function tabFromLocation(): ProfilePassportTab {
  const value = new URL(window.location.href).searchParams.get("tab");
  if (value === "activity" || value === "recognition") {
    return value;
  }
  return "overview";
}

export function ProfilePassportTabs({
  initialTab,
}: ProfilePassportTabsProps) {
  const [activeTab, setActiveTab] = useState<ProfilePassportTab>(initialTab);

  useEffect(() => {
    const panels = document.querySelectorAll<HTMLElement>(
      "[data-profile-passport-panel]",
    );

    for (const panel of panels) {
      const isActive = panel.dataset.profilePassportPanel === activeTab;
      panel.hidden = !isActive;
      panel.dataset.active = isActive ? "true" : "false";
    }
  }, [activeTab]);

  useEffect(() => {
    function handlePopState() {
      setActiveTab(tabFromLocation());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function switchTab(nextTab: ProfilePassportTab) {
    if (nextTab === activeTab) {
      return;
    }

    setActiveTab(nextTab);

    const url = new URL(window.location.href);
    if (nextTab === "overview") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", nextTab);
    }

    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <div
      className="profile-passport-tabs"
      role="tablist"
      aria-label="Profile sections"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "overview"}
        aria-controls="profile-passport-panel-overview"
        onClick={() => switchTab("overview")}
      >
        Overview
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "activity"}
        aria-controls="profile-passport-panel-activity"
        onClick={() => switchTab("activity")}
      >
        Activity
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "recognition"}
        aria-controls="profile-passport-panel-recognition"
        onClick={() => switchTab("recognition")}
      >
        Recognition
      </button>
    </div>
  );
}
