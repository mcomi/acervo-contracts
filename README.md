# Acervo contracts

OpenAPI contract between the Acervo web app (`../web`) and API (`../api`). Both sides generate
code from it: Spring interfaces in the API, a typed client, query hooks and mocks in the web app.

- Design rules: [`docs/api-guidelines.md`](docs/api-guidelines.md)
- How the repo works and why: [`docs/adr/`](docs/adr/)

## Requirements

Node 24.21 (`.nvmrc`), pnpm 12 and Java 11 or later for `pnpm test`.

## Commands

| Task                                   | Command                           |
| -------------------------------------- | --------------------------------- |
| Install                                | `pnpm install`                    |
| Bundle into `dist/openapi.yaml`        | `pnpm build`                      |
| Lint (Spectral + OWASP + Acervo rules) | `pnpm lint`                       |
| Test rules and Spring generation       | `pnpm test`                       |
| Format check / fix                     | `pnpm format` / `pnpm format:fix` |
| Add a changeset                        | `pnpm changeset`                  |

## Changing the contract

1. Start from the user story and the domain glossary (shared domain map).
2. Add or change files under `openapi/`, following the guidelines. Paths go in `openapi.yaml`.
3. `pnpm lint && pnpm test`.
4. Add a changeset: minor for new endpoints or fields, major (minor while on 0.x) for breaking
   changes, plus the `breaking-change` label on the pull request.
5. Front and back both review. After release, each consumer updates its copy of the bundle.

## Releasing

Nobody bumps versions by hand. On every push to `main`, the Release workflow collects the pending
changesets into a **Release: version packages** pull request (version in `package.json` and
`CHANGELOG.md`). Merging it tags `vX.Y.Z` and publishes a GitHub release with
`openapi.yaml` attached: that bundle is the file consumers copy.

The repo setting _Settings → Actions → General → Allow GitHub Actions to create and approve pull
requests_ must be on. The release pull request only changes the version and changelog, so CI skips
its changeset check.
