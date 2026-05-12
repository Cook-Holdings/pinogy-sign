# Rollback: PDF placeholder normalization (fork → Documenso baseline)

This note records a deliberate rollback of **Pinogy-specific PDF upload and placeholder-resolution behavior** so the core app aligns with **upstream Documenso** for normalization and in-PDF placeholder handling. Use it when triaging regressions or deciding what to reintroduce.

**Last updated:** 2026-05-12

## Signing / tablet / scroll (restored to upstream)

These **Pinogy UX** tweaks were reverted to match **upstream Documenso** (`upstream/main`):

| Area | File | Former fork behavior (removed) |
|------|------|----------------------------------|
| Konva field activation | `apps/remix/app/components/general/envelope-signing/envelope-signer-page-renderer.tsx` | ~400ms dedupe, `tap` + `pointerdown`, `try/finally` around loading spinner during sign |
| Signature pad | `packages/ui/primitives/signature-pad/signature-pad-dialog.tsx` | “Change” button when value exists; related layout / `data-testid` |
| Field validation scroll | `packages/lib/utils/fields.ts` | `scrollIntoView` used `behavior: 'auto'` on coarse pointer, mobile UA, or WebView |

Reintroduce from git history if tablets/WebViews regress (double-tap signing, janky scroll-to-field, or no way to replace an existing drawn signature).

## Scope (what we rolled back)

The following were restored from **upstream `documenso/documenso` main** (same behavior as stock Documenso):

| Area | Files | Former fork behavior (removed) |
|------|--------|----------------------------------|
| Normalized PDF upload | `packages/lib/universal/upload/put-file.server.ts` | No `extractPdfPlaceholders` on upload; no `NormalizedPdfUploadResult` / `placeholders` on `putNormalizedPdfFileServerSide`; normalized buffer uploaded as before |
| Document create from upload | `packages/trpc/server/document-router/create-document.ts` | No longer passes `placeholders` into envelope item creation |
| Template create from PDF | `packages/trpc/server/template-router/router.ts` | No longer passes `placeholders` on template envelope items |
| PDF placeholder parsing | `packages/lib/server-only/pdf/auto-place-fields.ts` | Upstream rules for regex per page, recipient segment handling, etc. (no fork-only defaults/trim logic beyond upstream) |
| Placeholder type / search helpers | `packages/lib/server-only/pdf/helpers.ts` | No `INITIAL` alias; no `getInitialsPlaceholderSearchVariants` / `getRecipientSlotPlaceholderSearchVariants` |
| Envelope field creation from PDF text | `packages/lib/server-only/field/create-envelope-fields.ts` | Single `pdfDoc.findText(field.placeholder)` search (exact string only) |

## What we kept (not part of this rollback)

### Template field API: placeholder **or** coordinates

**`packages/trpc/server/field-router/schema.ts`** and **`router.ts`** still allow **`POST /template/field/create-many`** to accept either:

- coordinate-based fields (`pageNumber`, `pageX`, `pageY`, …), or  
- **placeholder-based** fields (`placeholder`, optional `width` / `height` / `matchAll`).

**Reason:** `apps/token-exchange` calls this API with placeholder payloads. Upstream Documenso’s OpenAPI schema for the same route only documents coordinates; restoring that wholesale would **break token-exchange without editing that app**. This layer is a small **API surface** extension, not PDF normalization.

### `apps/token-exchange`

No behavioral changes to routes or client logic as part of this rollback. A **JSDoc** on `createTemplateFields` in `apps/token-exchange/lib/documenso-client.ts` was updated so it no longer references removed internal helper names.

## Operational impact / things to watch

1. **Placeholder spelling in PDFs must match the API**  
   Documenso resolves placeholders with **exact** PDF text search. Fork-era behavior that tried alternate spellings (`initial` vs `initials`, with/without `, r1`) is gone. Templates and integrations must use strings that literally appear in the PDF.

2. **No upload-time placeholder list on create**  
   Documents/templates created from a PDF no longer attach a precomputed `placeholders` array on the envelope item from `putNormalizedPdfFileServerSide`. Any flow that depended on that **fork-only** attachment needs to use upstream mechanisms (e.g. later extraction, manual fields, or template field APIs).

3. **E2E / fixtures**  
   If you have tests that assumed fork-specific PDFs or behaviors, re-run **`packages/app-tests`** (e.g. auto-place / placeholder API specs) after deploy.

## If you need the old behavior again

- **Narrow:** Reintroduce only the pieces you need (e.g. search variants in `helpers.ts` + `create-envelope-fields.ts`) behind a feature flag or env, and add tests with real PDFs.  
- **Broad:** Cherry-pick the pre-rollback versions of the files listed in the table from git history (search commits touching “placeholder”, “extractPdfPlaceholders”, or “NormalizedPdf”).

## Related internal docs

- `docs/runbooks/api-v2-envelope-item-download.md` — API v2 download runbook (unchanged by this rollback).

## Docker / CI build notes (2026-05-12)

- **Lingui + CSS placeholder:** A `t` macro on the custom CSS `<Textarea>` placeholder (with `.my-button { ... }`) produced **ICU parse errors** in locales such as **zh** and **ko** at `lingui compile` time. Fix: use a plain **English `const` string** for that code sample in `branding-preferences-form.tsx`, then run `npm run translate:extract` (with `--clean` via the root script) so the old `msgid` is removed from catalogs.
- **`get-folder-breadcrumbs`:** `const breadcrumbs = []` inferred **`never[]`** under strict `tsc`, breaking `push`/`unshift`. Fix: **`const breadcrumbs: Folder[] = []`** with `import type { Folder } from '@prisma/client'`.
- **Embed authoring mock org:** `OrganisationSession` (from `ZOrganisationSchema` + session fields) does **not** include `organisationClaimId` / `organisationGlobalSettingsId` / `organisationAuthenticationPortalId` on the top-level object; remove those from the mock in `embed+/v2+/authoring+/_layout.tsx` and keep nested **`organisationClaim`** only.

**npm engine:** Root `package.json` may require `npm >= 11.11.0`; Docker images using npm 10 will log `EBADENGINE` — upgrade the install stage image or npm when you want a clean install.

### `Dockerfile.token-exchange` — Prisma client before `next build`

`npm ci` runs **before** `COPY out/full/`, so `prisma generate` in `@documenso/prisma` postinstall often runs **without** `schema.prisma`. The client can omit newer fields (e.g. `brandingColors`), and **`next build`** then typechecks `packages/lib` and fails.

**Fix:** run `npx prisma generate --schema ./packages/prisma/schema.prisma` **after** copying `out/full/` and **before** `turbo run build --filter=@documenso/token-exchange`.
