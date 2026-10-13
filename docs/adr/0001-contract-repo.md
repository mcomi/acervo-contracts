# 1. Contract repo: format, tooling and distribution

Date: 2026-10-11 · Status: accepted

## Context

The web app (TypeScript) and the API (Java) are separate repos built by different people. They
need one agreement on endpoints that both can generate code from, that changes through review,
and that costs nothing to host.

## Decision

- **OpenAPI 3.1**, written as many small YAML files under `openapi/` (one per path, schema,
  parameter, response) so two people can change it without conflicts.
- **Bundling** with `@redocly/openapi-core` into `dist/openapi.yaml`, stamped with the package
  version. The bundle is what gets linted, tested and shipped.
- **Linting** with Spectral: the OpenAPI and OWASP API Security rulesets plus Acervo rules for
  the conventions in `docs/api-guidelines.md`. Three OWASP rules are off, each with its reason in
  `.spectral.yaml`. Spectral lints the bundle because it reports false schema errors on external
  `$ref`s in 3.1 path items.
- **Tests** prove that every Acervo rule rejects a bad contract, and that openapi-generator
  turns the contract into Spring Boot 4 interfaces without new warnings. The generator jar comes
  from Maven Central and is checked against a pinned SHA-256. Its 3.1 support is beta, which is
  the reason for this test.
- **Breaking changes** are detected in CI with oasdiff against `main`. It runs with uploads and PR
  comments turned off so the contract does not leave CI.
- **Releases** use Changesets: the version bump and changelog come from the changeset files, and
  each release is a git tag (`vX.Y.Z`) and a GitHub release with the bundle attached.
- **Distribution**: each consumer commits a copy of the released `dist/openapi.yaml` (the web app
  in its API client package, the API in its resources) and generates code from it. Builds stay
  reproducible offline and in CI, need no package registry or tokens, and the copy's
  `info.version` says which release it is. A sync script in each consumer will replace the copy
  from a tagged checkout of this repo.

## Consequences

- Updating a consumer is an explicit commit with a visible diff of the contract.
- A consumer can lag behind; `info.version` makes that visible.
- If copies become a burden, publishing to GitHub Packages (free for private repos within limits)
  can replace them without changing the contract itself.
- Running the generator test needs Java 11 or later locally; CI uses Java 25.
