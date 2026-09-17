import Link from "next/link";

import { KButton, KNativeSelect, KTextInput } from "@/components/ui/keluarga-ui";

const statusOptions = [
  { value: "all", label: "All" },
  { value: "pending", label: "Not arrived" },
  { value: "signed_in", label: "Checked in" },
  { value: "signed_out", label: "Checked out" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "absent", label: "Absent" },
  { value: "anomaly", label: "Needs review" },
];

type AttendanceFilterFormProps = {
  eventId: string;
  timeslotId: string;
  query: string;
  status: string;
  mobile?: boolean;
};

export function AttendanceFilterForm({
  eventId,
  timeslotId,
  query,
  status,
  mobile = false,
}: AttendanceFilterFormProps) {
  return (
    <form
      className={mobile ? "phaseone-mobile-filter-form" : "phaseone-attendance-filters phaseone-desktop-filters"}
      method="get"
    >
      <input name="timeslot" type="hidden" value={timeslotId} />
      <KTextInput
        defaultValue={query}
        label="Search"
        name="q"
        placeholder={mobile ? "Name, ID or contact" : "Name, volunteer ID or contact number"}
      />
      <KNativeSelect
        data={statusOptions}
        defaultValue={status}
        label="Status"
        name="status"
      />
      {mobile ? (
        <div className="phaseone-mobile-filter-actions">
          <KButton type="submit">Apply</KButton>
          <Link className="button button-secondary" href={`/admin/events/${eventId}/attendance?timeslot=${encodeURIComponent(timeslotId)}`}>
            Clear
          </Link>
        </div>
      ) : (
        <KButton type="submit" variant="light">Apply filters</KButton>
      )}
    </form>
  );
}
