"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

type Props = {
  eventId: string;
  rosterCount: number;
  canManageProgramme: boolean;
  setup: ReactNode;
  roster: ReactNode;
  initialTab?: "setup" | "roster";
};

export function ProgrammeEditorWorkspace({eventId, rosterCount, canManageProgramme, setup, roster, initialTab}: Props) {
  const [tab, setTab] = useState<"setup" | "roster">(initialTab ?? (canManageProgramme ? "setup" : "roster"));
  useEffect(() => {
    const update = () => {
      if (window.location.hash === "#roster") setTab("roster");
      else if (window.location.hash === "#guide") setTab(canManageProgramme ? "setup" : "roster");
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [canManageProgramme]);
  function select(next: "setup" | "roster") {
    setTab(next);
    window.history.replaceState(null, "", next === "setup" ? "#guide" : "#roster");
  }
  return (
    <div className="km-programme-workspace">
      <nav className="km-editor-nav" aria-label="Programme workspace">
        {canManageProgramme ? <button type="button" aria-current={tab==="setup"?"page":undefined} onClick={()=>select("setup")}>Setup</button> : null}
        <button type="button" aria-current={tab==="roster"?"page":undefined} onClick={()=>select("roster")}>Roster · {rosterCount}</button>
        <Link href={`/admin/events/${eventId}/attendance`}>Attendance</Link>
        <Link href={`/admin/events/${eventId}/attendance/monitor`}>Live</Link>
        <details className="km-programme-more">
          <summary>More</summary>
          <div className="km-programme-more-items">
            <Link href={`/admin/registrations?event=${eventId}`}>Registrations</Link>
            {canManageProgramme ? <Link href={`/admin/events/${eventId}/leaders`}>Volunteer leaders</Link> : null}
            <Link href={`/admin/events/${eventId}/insights`}>Insights</Link>
            <Link href={`/admin/events/${eventId}/attendance/reconcile`}>Reconcile</Link>
          </div>
        </details>
      </nav>
      <div id="guide" className="km-programme-pane" hidden={tab!=="setup"}>{setup}</div>
      <div id="roster" className="km-programme-pane" hidden={tab!=="roster"}>{roster}</div>
    </div>
  );
}
