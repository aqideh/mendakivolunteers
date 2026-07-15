# YM Hub field request

Request API names and metadata, not only the labels visible in Salesforce screens.

## Phase 1 volunteer identity fields

| Requirement | Working placeholder | Information required from YM Hub |
|---|---|---|
| Volunteer object | `[YMH_VOLUNTEER_OBJECT_API]` | Object label and object API name |
| Volunteer record ID | `[YMH_VOLUNTEER_RECORD_ID_API]` | Standard or custom record identifier used for API queries |
| MENDAKI volunteer ID | `[YMH_VOLUNTEER_ID_API]` | Field label, field API name, data type, uniqueness, mutability |
| Volunteer status | `[YMH_VOLUNTEER_STATUS_API]` | Field API name and all picklist API values |
| Source update timestamp | `[YMH_VOLUNTEER_UPDATED_AT_API]` | Preferred replication field, normally `SystemModstamp` where available |

## Request template

For each object and field, provide:

- Object label and object API name.
- Field label and field API name.
- Data type and maximum length.
- Required or nullable status.
- Unique or external-ID configuration.
- Relationship path for related objects.
- Picklist labels and underlying API values.
- Whether the value can change after creation.
- Anonymised example records.
- Expected record volume and update frequency.
- Deletion, merge, and inactive-record behaviour.

## Later-phase objects

## Phase 3 registration fields

Provide the registration or participation object API name and these field API
names:

- Unique registration record identifier.
- Volunteer relationship and the related volunteer ID path.
- Activity relationship and the related activity ID path.
- Registration status, including every possible API value.
- Registration timestamp.
- Source update timestamp, preferably `SystemModstamp` where appropriate.
- Deletion and cancellation semantics.

## Phase 3 attendance fields

Provide the attendance object API name and these field API names:

- Unique attendance record identifier.
- Volunteer relationship and the related volunteer ID path.
- Activity relationship and the related activity ID path.
- Attendance status, including every possible API value.
- Verified hours and numeric precision.
- Verification timestamp and the actor or process that sets it.
- Source update timestamp, preferably `SystemModstamp` where appropriate.
- Correction, rejection, deletion, and record-merge semantics.

## Shared activity fields

For the related activity object, provide:

- Unique activity identifier.
- Title.
- Category.
- Start and end timestamps, including the source timezone contract.

## Later-phase objects

The same exercise will later be required for:

- Verified hours.
- Optional referral-code capture.

Do not replace canonical application names with Salesforce API names. Actual mappings should be supplied through the `SalesforceYmHubGateway` configuration so that the rest of the application remains unchanged.
