"use client";

import { deleteProfessionalEvent } from "./actions";
import styles from "./professional-events-admin.module.css";

export function DeleteProfessionalEventButton({
  eventId,
  eventTitle,
}: {
  eventId: string;
  eventTitle: string;
}) {
  return (
    <button
      className={`button button-secondary ${styles.deleteButton}`}
      formAction={deleteProfessionalEvent}
      name="id"
      value={eventId}
      type="submit"
      onClick={(event) => {
        const confirmed = window.confirm(
          `Delete "${eventTitle}"? This cannot be undone.`,
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      Delete event
    </button>
  );
}
