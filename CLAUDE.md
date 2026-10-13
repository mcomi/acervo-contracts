# Acervo contracts

OpenAPI 3.1 contract shared by `../web` (React) and `../api` (Java, Spring Boot 4). Shared context
(product, domain, cross-repo decisions): `../docs` (repo `acervo-docs`). Engineering conventions (git, commits,
changesets, CI): `../web/docs/engineering-conventions.md`; API design rules:
`docs/api-guidelines.md`; repo decisions: `docs/adr/`.

## Layout

- `openapi/openapi.yaml` — root: info, servers, security, tags and the path list.
- `openapi/paths/<module>/` — one file per path. `openapi/components/` — schemas, parameters,
  responses, headers, one per file; the file name becomes the component (and class) name.
- `.spectral.yaml` — lint rules; `test/` — rule tests and the Spring generation test.
- `scripts/bundle.mjs` — bundles into `dist/openapi.yaml` with the package version.

## Commands

`pnpm build`, `pnpm lint`, `pnpm test` (needs Java 11+), `pnpm format` / `pnpm format:fix`.
Hooks: pre-commit runs format + lint, pre-push runs test.

## Gotchas

- Lint runs on the bundle: Spectral reports false errors on external `$ref`s in 3.1 path items.
- New Acervo rules need a case in `test/fixtures/invalid-contract.yaml` and a test.
- Upgrading openapi-generator means updating both the version and the SHA-256 in
  `test/generators.test.mjs`.
- `changeset add` is interactive: write `.changeset/*.md` by hand and check it with
  `pnpm changeset status --verbose`.
- `@scarf/scarf` (telemetry) is denied in `allowBuilds`; review any new install script.
