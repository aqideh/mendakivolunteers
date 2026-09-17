import { applyAttendanceChange } from "@/app/admin/events/[id]/attendance/actions";
import { KButton, KNativeSelect, KTextInput } from "@/components/ui/keluarga-ui";

const correctionOptions = [
  { value: "mark_sign_in", label: "Set or correct check-in" },
  { value: "mark_sign_out", label: "Set or correct check-out" },
  { value: "clear_sign_in", label: "Clear check-in" },
  { value: "clear_sign_out", label: "Clear check-out" },
  { value: "mark_withdrawn", label: "Mark withdrawn" },
  { value: "mark_absent", label: "Mark absent" },
  { value: "clear_non_attendance", label: "Clear withdrawn/absent status" },
];

type AttendanceCorrectionFormProps = {
  eventId: string;
  rosterId: string;
  timeslotId: string;
  defaultAction: string;
  defaultTimestamp: string;
};

export function AttendanceCorrectionForm({
  eventId,
  rosterId,
  timeslotId,
  defaultAction,
  defaultTimestamp,
}: AttendanceCorrectionFormProps) {
  return (
    <form action={applyAttendanceChange} className="phaseone-attendance-correction">
      <input name="eventId" type="hidden" value={eventId} />
      <input name="rosterId" type="hidden" value={rosterId} />
      <input name="timeslotId" type="hidden" value={timeslotId} />
      <KNativeSelect
        data={correctionOptions}
        defaultValue={defaultAction}
        label="Correction"
        name="action"
      />
      <KTextInput
        defaultValue={defaultTimestamp}
        description="Leave blank to use the current time. Singapore time."
        label="Timestamp"
        name="timestamp"
        type="datetime-local"
      />
      <KTextInput
        className="phaseone-attendance-reason"
        label="Reason"
        maxLength={500}
        minLength={5}
        name="reason"
        placeholder="Required audit reason"
        required
      />
      <KButton type="submit" variant="light">Save correction</KButton>
    </form>
  );
}
