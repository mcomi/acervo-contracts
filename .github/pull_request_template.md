## What and why

<!-- What changes and why. Link the ticket and the user story. -->

## How to test

1. `pnpm lint && pnpm test`
2.

## Checklist

Only tick what is true; list below what could not be verified.

- [ ] Follows `docs/api-guidelines.md` (naming, errors, pagination, concurrency, tenancy)
- [ ] Every new operation has `x-permission`, one module tag, examples and all error responses
- [ ] Reviewed by both front and back
- [ ] Breaking change? If yes: `breaking-change` label, major changeset (minor on 0.x) and a
      migration note for consumers
- [ ] Changeset added, or an empty one for no release
- [ ] Docs updated (or N/A)

## Not verified

<!-- Anything you could not check, and why. -->
