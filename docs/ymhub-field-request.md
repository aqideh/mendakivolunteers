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

The same exercise will be required for:

- Registration or participation records.
- Activities or opportunities.
- Attendance verification records.
- Verified hours.
- Optional referral-code capture.

Do not replace canonical application names with Salesforce API names. Actual mappings should be supplied through the `SalesforceYmHubGateway` configuration so that the rest of the application remains unchanged.
