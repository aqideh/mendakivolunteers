## Summary

Describe the user or operational outcome.

## Source-of-truth boundary

- [ ] The change preserves KELUARGA ownership of recruitment, registration and event operations without requiring a YM Hub record first.
- [ ] Verified attendance/hours and YM Hub reconciliation remain clearly separated from KELUARGA operational state.
- [ ] Any YM Hub fields are accessed through the gateway/canonical app types and do not overwrite newer KELUARGA operational records.

## Security and privacy

- [ ] Browser access is protected by RLS and least-privilege grants.
- [ ] No service, secret, or Salesforce credential is included in client code.
- [ ] Administrative or identity changes produce an audit event.
- [ ] New personal data has a documented purpose and retention requirement.

## Validation

- [ ] Lint
- [ ] Type-check
- [ ] Unit tests
- [ ] Database tests or migration review
- [ ] Production build
