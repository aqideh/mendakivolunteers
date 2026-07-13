## Summary

Describe the user or operational outcome.

## Source-of-truth boundary

- [ ] The change does not make the app authoritative for YM Hub registration, attendance verification, or verified hours.
- [ ] Any YM Hub fields are accessed through the gateway and canonical app types.

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
