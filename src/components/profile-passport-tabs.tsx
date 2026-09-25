"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ProfilePassportTab = "overview" | "activity" | "recognition";

type ProfilePassportTabsProps = Readonly<{
  initialTab: ProfilePassportTab;
  overview: ReactNode;
  activity: ReactNode;
  recognition: ReactNode;
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
  overview,
  activity,
  recognition,
}: ProfilePassportTabsProps) {
  const [activeTab, setActiveTab] = useState<ProfilePassportTab>(initialTab);

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

  const panel =
    activeTab === "activity"
      ? activity
      : activeTab === "recognition"
        ? recognition
        : overview;

  return (
    <>
      <div
        className="profile-passport-tabs"
        role="tablist"
        aria-label="Profile sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "overview"}
          aria-controls="profile-passport-tab-panel"
          onClick={() => switchTab("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "activity"}
          aria-controls="profile-passport-tab-panel"
          onClick={() => switchTab("activity")}
        >
          Activity
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "recognition"}
          aria-controls="profile-passport-tab-panel"
          onClick={() => switchTab("recognition")}
        >
          Recognition
        </button>
      </div>

      <div
        id="profile-passport-tab-panel"
        className="profile-passport-tab-transition"
        role="tabpanel"
        key={activeTab}
      >
        {panel}
      </div>
    </>
  );
}
