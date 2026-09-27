"use client";

import { useEffect, useState } from "react";

const PROFILE_EDIT_EVENT = "keluarga:profile-edit";

type ProfileEditToggleProps = Readonly<{
  initialEditing: boolean;
  variant?: "settings" | "text";
}>;

export function ProfileEditToggle({
  initialEditing,
  variant = "text",
}: ProfileEditToggleProps) {
  const [editing, setEditing] = useState(initialEditing);

  useEffect(() => {
    function handleEditState(event: Event) {
      const customEvent = event as CustomEvent<boolean>;
      setEditing(Boolean(customEvent.detail));
    }

    window.addEventListener(PROFILE_EDIT_EVENT, handleEditState);
    return () => window.removeEventListener(PROFILE_EDIT_EVENT, handleEditState);
  }, []);

  useEffect(() => {
    const panel = document.querySelector<HTMLElement>("[data-profile-edit-panel]");
    if (panel) {
      panel.hidden = !editing;
    }
  }, [editing]);

  function toggleEdit() {
    const nextEditing = !editing;
    window.dispatchEvent(
      new CustomEvent<boolean>(PROFILE_EDIT_EVENT, {
        detail: nextEditing,
      }),
    );

    const url = new URL(window.location.href);
    if (nextEditing) {
      url.searchParams.set("profile", "edit");
    } else {
      url.searchParams.delete("profile");
    }

    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );

    if (nextEditing) {
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>("[data-profile-edit-panel]")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  if (variant === "settings") {
    return (
      <button
        className="profile-passport-settings"
        type="button"
        onClick={toggleEdit}
        aria-expanded={editing}
        aria-controls="profile-passport-edit-panel"
        aria-label={editing ? "Close profile editor" : "Edit profile"}
        title={editing ? "Close profile editor" : "Edit profile"}
      >
        <span aria-hidden="true">⚙</span>
      </button>
    );
  }

  return (
    <button
      className="text-link button-reset profile-passport-edit-toggle"
      type="button"
      onClick={toggleEdit}
      aria-expanded={editing}
      aria-controls="profile-passport-edit-panel"
    >
      {editing ? "Close" : "Edit"}
    </button>
  );
}
