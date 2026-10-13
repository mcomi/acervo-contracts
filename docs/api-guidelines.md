# API guidelines

How every endpoint in the contract is designed. Spectral enforces the rules marked **(lint)**;
review covers the rest. When a rule does not fit a case, change this document in the same pull
request instead of making an exception in silence.

## Resources and naming

- Base URL ends in the major version: `https://<host>/v1`. A new major only for changes that
  cannot be made compatible; until then everything evolves inside `v1`.
- Paths are plural nouns in kebab-case, grouped by module: `/catalog/works`,
  `/custody/movements`. Path parameters are camelCase: `{workId}`. **(lint)**
- The API speaks English, like the code. The interface translates; the API never returns text meant
  for end users, except data users typed.
- Each operation has exactly one tag, the product module it belongs to. Tag, module id, Java
  package and front-end module folder use the same name. **(lint)**
- `operationId` is camelCase and starts with a verb: `listWorks`, `getWork`, `createWork`,
  `replaceWork`, `deleteWork`. Generators turn it into method and hook names. **(lint)**
- Properties are camelCase. **(lint)** Booleans read as questions: `isActive`, `hasCopies`.

## Tenancy and access

- The organization comes from the access token. No path, parameter or body names an
  organization or tenant. **(lint)**
- Every operation declares the permission it checks in `x-permission`, as
  `<module>.<resource>.<action>` (`catalog.works.write`), or `authenticated`. **(lint)** The API
  enforces it; the web app only uses it to hide what the user cannot do.
- A module outside the organization's plan answers 403 with code `auth.module-not-entitled`; a
  missing permission answers 403 with `auth.permission-denied`.
- `GET /me` returns the user, the organization, the entitled modules and the permissions. The web
  app builds its menus from it.

## Data types

- Ids are UUIDs (version 7, so they sort by creation time), never sequential numbers.
- Timestamps are RFC 3339 in UTC (`2026-10-11T18:30:00Z`); calendar dates use `format: date`.
- Countries use ISO 3166-1 alpha-2, languages BCP 47 (`es-MX`).
- Optional fields are left out when empty, never sent as `null`. Arrays are empty, not missing,
  when the field is required.
- Every string has `maxLength`, every array `maxItems`, every integer `minimum`, `maximum` and a
  `format`. **(lint, OWASP)**
- Request bodies set `additionalProperties: false`, so typos fail instead of being ignored.
  Response schemas do not, so adding a field never breaks a client.
- Request and response schemas are separate (`WorkInput`, `Work`) and flat, without `allOf`; the
  Java and TypeScript generators produce cleaner code that way.
- Named enums are their own schema (`WorksSortField`), so generators produce a real enum type.

## Errors

- Every 4xx and 5xx response is `application/problem+json` (RFC 9457) with the `Problem`
  schema. **(lint)**
- Clients branch on `code` (`resource.not-found`, `request.invalid`) and translate it. `title`
  and `detail` are English text for developers. Codes never change meaning; new ones can appear,
  so clients handle unknown codes with a generic message.
- Validation errors are 400 with `code: request.invalid` and one `errors` entry per invalid
  value: a JSON Pointer to it and a reason code (`required`, `too-long`, `out-of-range`).
- Every operation lists 400, 401, 429 and 500; protected ones add 403; ones with an id add 404.

## Lists and pagination

- Lists shown in screens use page numbers: `page` (0-based), `size` (default 25, maximum 100) and
  return `{ items, page: { number, size, totalItems, totalPages } }`. Archive staff need totals and
  to jump between pages, and the web app's data table works this way.
- `sort` takes one field from an enum per endpoint; a leading `-` sorts descending
  (`-productionYear`).
- `search` is a free-text filter; specific filters are named query parameters.
- Feeds read in order to the end (offline sync for the vault app, audit events) will use a cursor
  instead, because pages shift while new items arrive. Their shape is defined with the first feed.

## Changes and concurrency

- Reads of a single resource return an `ETag`. Writes (`PUT`, `DELETE`) require `If-Match` with
  it: 428 when missing, 412 when someone else changed the resource since. Two archivists
  cataloguing the same work never overwrite each other silently.
- `PUT` replaces every editable field. `PATCH` is not used until a case needs it.
- `POST` that creates returns 201 with the resource, `Location` and `ETag`.

## Versioning and compatibility

- The contract is versioned with SemVer through Changesets. While on `0.x`, a breaking change
  bumps the minor version; from `1.0.0` on, the major.
- Compatible changes: new endpoints, new optional request fields, new response fields, new error
  codes. Anything else is breaking, and CI flags it with oasdiff.
- Deprecate before removing: mark the operation or field `deprecated: true` and say in the
  description what replaces it.
