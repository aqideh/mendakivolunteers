# YM Hub batch integration decisions and open items

**Last updated:** 21 September 2026  
**Repository:** `aqideh/mendakivolunteers`  
**Status:** Living implementation decision log

> **Repository visibility:** This repository is public. This document records technical and operational decisions only. Do not add personal data, internal credentials, commercial details or real volunteer records.

## Purpose

This note records the agreed rules for the first KELUARGA <-> YM Hub/Salesforce batch integration and keeps the remaining external follow-ups in one place.

YM Hub remains authoritative for volunteer identity, initiative/assignment data, official attendance and verified hours. KELUARGA owns its own authentication/account state, event-day operational attendance, event-guide enrichment and batch/audit workflow.

---

## Confirmed decisions

### Batch model

- Use period-based CSV handoffs rather than requiring every routine import to be a complete lifetime snapshot.
- Staff may choose the reporting period when exporting from YM Hub.
- The KELUARGA Batch Centre must remember handoff history so staff do not need to maintain separate manual notes of what has already been imported/exported.
- Each import/export batch should record the selected period, dataset/type, timestamp, staff actor, row count, checksum, outcome and relevant Salesforce record IDs.
- Re-imports should upsert by stable Salesforce record ID rather than create duplicates.
- Missing records in a period-based file must not be interpreted as deletions.
- Broader reconciliation exports can be run when required.

### Volunteer Initiative

- `Is Ad Hoc` is a dedicated programme-type boolean and is not a KELUARGA category.
- `is_ad_hoc = true` means an ad-hoc volunteer initiative.
- `is_ad_hoc = false` represents a longer-running volunteer programme, which may involve a longer application process.
- KELUARGA categories/taxonomy will be managed separately in the app later.
- The integration should support a `Published` boolean, including `Published = false`.
- KELUARGA admins must also be able to manually unpublish/hide an initiative if operationally required.
- Past events should be hidden from ordinary current-event interfaces 7 days after the event has ended.
- Description, venue, volunteer-facing registration URL and image URL are requested from YM Hub.
- Image URLs are expected to be stable and hosted through Salesforce/YM Hub.

### Job Position and Shift

- Job Position = volunteer role, for example Event Support.
- Job Position Shift = time slot.
- Conflicting/duplicate assignments for the same volunteer and shift are not expected to be valid source data and should be treated as exceptions if encountered.

### Job Position Assignment

- Job Position Assignment is the source object linking a volunteer to an initiative/shift and provides the Salesforce record ID required for attendance write-back.
- All assignments are expected to be exportable; anticipated volume is manageable.
- Assignment export periods can be selected manually in YM Hub.
- KELUARGA may maintain an internal canonical assignment projection while continuing to expose registration and official-attendance read models to the rest of the app. This is a KELUARGA-only architectural choice and does not require Salesforce changes.

### Attendance and verified hours

- KELUARGA captures operational check-in/check-out timestamps.
- YM Hub calculates authoritative `Actual Duration` and verified volunteer hours.
- YM Hub duration is expected to use decimal hours, likely two decimal places.
- KELUARGA should preserve the authoritative numeric value and convert it only for display, for example `2.50` -> `2h 30m`.
- Official hours are rolling-period verified hours supplied by YM Hub.
- All integration timestamps use ISO 8601 with explicit Singapore offset `+08:00`.
- The app operates in Singapore time only for this integration.

### Multi-shift attendance

- A volunteer registered for multiple consecutive or overlapping shifts receives attendance against each registered shift according to time served.
- For overlapping registered shifts, prevent double-counting: allocate time to the first shift until its end, then begin the next shift at that boundary.
- The volunteer should not need to check out and back in merely because one registered shift flows directly into the next.
- For non-contiguous shifts with a genuine gap, the volunteer should check out after the first shift and check in again for the next shift. KELUARGA should not automatically allocate a continuous attendance gap between separate shifts.
- Legitimate service outside the advertised shift window should count.
- If attendance lands within 30 minutes outside the registered shift coverage, accept it without additional validation.
- If attendance extends more than 30 minutes outside the registered shift coverage, retain the recorded timestamps but flag the record for staff validation before it is eligible for YM Hub attendance export.

### Walk-ins

- Walk-ins must not be mixed into the ordinary YM Hub attendance-update file when no Job Position Assignment exists.
- Generate a separate walk-in follow-up report for staff.
- The report should preserve enough data to identify the person/event/shift, actual attendance timestamps and later resulting Job Position Assignment ID if staff creates/reconciles one in YM Hub.
- This should reduce the need for staff to remember unresolved walk-ins manually.

### Attendance handoff state

KELUARGA should retain explicit batch/export states such as:

1. Ready
2. Exported
3. Handed off
4. Confirmed in YM Hub
5. Rejected / Needs correction

Generating a CSV alone must not be treated as confirmation that Salesforce accepted the rows.

### Accounts and email

- A volunteer becomes eligible for KELUARGA access based on the agreed YM Hub eligibility/import logic.
- KELUARGA retains its own account state, including active/suspended/closed states.
- YM Hub remains responsible for authoritative email changes.
- Salesforce Person Account ID remains the durable source identity link after activation; email is not the canonical identity key.

### Outbound attendance fields

- Blank attendance fields should remain blank where required, for example an absent record should not invent start/end timestamps.
- Actual Duration and final official-hour calculation belong to YM Hub rather than KELUARGA.

---

## Current implementation status

The repository has progressed beyond the original planning-only state.

### Implemented foundation

- A staff-only **YM Hub Batch Centre** exists at `/admin/integrations/ymhub`.
- The inbound importer currently expects four source datasets in one validated batch:
  1. Person Accounts
  2. Volunteer Initiatives
  3. Job Position Shifts
  4. Job Position Assignments
- The current internal importer template version is `1.0-20260915`.
- Import preview/validation checks required fields, accepted header aliases, formats, duplicate source IDs and cross-file references before commit.
- Additional approved source columns can be carried without breaking the current validation flow.
- Source Salesforce statuses are preserved as raw values rather than being guessed into a KELUARGA lifecycle.
- Batch history records import state and supports checksum-based duplicate-file detection.
- The Batch Centre has a server-side summary for committed imports, exceptions, export batches and pending handoffs.
- Imported source rows are projected by stable source IDs so later imports can update rather than duplicate records.

### Still incomplete

- The internal importer template is an implementation contract, not confirmation that CWS/YM Hub has frozen the final external CSV contract.
- Formal attendance export-batch tracking and downstream accepted/rejected reconciliation are not yet complete.
- Walk-in reconciliation into newly created YM Hub assignments still requires the agreed staff follow-up workflow.
- Final source status dictionaries and correction semantics remain external dependencies.

---

## Outstanding external follow-ups

No external follow-up below should be considered resolved merely because KELUARGA has implemented a compatible internal assumption.

### P0 - required before finalising importer/exporter behaviour

- [ ] **Final inbound file/batch format.** Confirm the final CSV templates, headers, naming convention and whether the four report files are generated together or independently. KELUARGA currently has an internal versioned template, but this still needs external confirmation.
- [ ] **Volunteer Initiative status values.** Obtain the complete Salesforce/API-value list and agreed meaning of every status.
- [ ] **Job Position Assignment status values and lifecycle.** Obtain the complete status list and confirm how assignment/application states transition to attendance states while retaining the same Job Position Assignment ID.
- [ ] **Report-period filter semantics.** For each report, confirm which source date/field the selectable export period filters on (initiative date, shift date, assignment creation date, attendance date, etc.). This determines whether later corrections to older records will appear in a newer export.
- [ ] **Attendance correction/re-import behaviour.** Confirm that re-importing the same Job Position Assignment ID with corrected start/end/status values cleanly updates the existing Salesforce record.
- [ ] **Attendance import result handling.** Confirm how staff can tell which Salesforce attendance-import rows succeeded or failed, for example through a success/error result file or another explicit confirmation mechanism.

### P1 - confirm during final integration contract/testing

- [ ] **Salesforce ID representation.** Confirm whether exported record IDs will consistently use 18-character Salesforce IDs. KELUARGA will store IDs as opaque text regardless.
- [ ] **Image accessibility.** Confirm that Salesforce/YM Hub-hosted image URLs can be retrieved by ordinary KELUARGA users without requiring a Salesforce login/session.
- [ ] **Exact decimal-duration behaviour.** YM Hub owns the calculation, but confirm the final precision/rounding convention during acceptance testing so KELUARGA display conversion can be verified.

---

## Batch Centre implementation intent

The Batch Centre should minimise staff memory and manual tracking.

### Already implemented or partially implemented

- inbound imports grouped into a four-dataset batch;
- versioned expected templates;
- required-column/header validation;
- checksum and duplicate-file safeguards;
- Salesforce-record upserts rather than duplicate creation;
- import history with row counts and outcome;
- retained warnings/exceptions rather than silent coercion;
- source-status preservation;
- server-side batch summary and audit trail.

### Remaining operational work

- period-aware import/export history in the staff workflow;
- formal attendance export history and per-row handoff state;
- separate walk-in follow-up reporting;
- clear warnings for attendance needing more than 30-minute out-of-window validation;
- downstream success/failure reconciliation after YM Hub attendance import;
- broader reconciliation imports without deleting records merely because they are absent from a period-based file.

---

## Current implementation assumption

Until the outstanding external items above are resolved, implementation should preserve raw/source Salesforce status values and avoid irreversible mappings.

The importer may validate known structural requirements and preserve source values, but unknown or newly introduced source states should be surfaced for review rather than silently coerced.

The operational attendance model must continue to distinguish:

- consecutive/overlapping registered shifts, where attendance continuity is automatic and time is allocated across shift boundaries without double-counting; and
- non-contiguous shifts with a genuine gap, where the volunteer checks out and later checks in again.
