# Patch: @libpdf/core — signature widget never added to page `/Annots`

**Patch files:**
- `patches/@libpdf+core+0.3.3.patch` — active on `main` (`@libpdf/core` 0.3.3, method `findOrCreateSignatureField`)
- `docs/fork-patches/v2.15-sync-branch/@libpdf+core+0.4.1.patch` — variant for the v2.15.0 upstream-sync branch (`@libpdf/core` 0.4.1, method `prepareSignatureField`; same fix, different method name/offsets)

**Marker in code:** `PINOGY-PATCH(sig-widget-annots)`
**Added:** 2026-07-21

## Problem

`pdf.sign()` creates a merged signature field+widget (`/FT /Sig`, `/Subtype
/Widget`, `/Rect [0 0 0 0]`), registers it in `/AcroForm /Fields`, and sets
`/P <first page>` — but never appends the widget ref to that page's `/Annots`
array. The signed output therefore contains an orphan widget annotation, which
violates ISO 32000 (widgets must be reachable via a page's `/Annots`). Adobe
Acrobat treats this as structural damage and can drop/invalidate the signature
when it repairs or re-serializes the file (e.g. at print time).

Forensic evidence: `Signed paperwork 5513` (sealed 2026-07-20) — sig widget
`545 0 obj` declares `/P 3 0 R`, but page `3 0 R` has no `/Annots` and is never
rewritten in the signing incremental update.

## Fix

At the end of the field-preparation method
(`prepareSignatureField` in 0.4.1 / `findOrCreateSignatureField` in 0.3.3, both
in `dist/index.mjs` — the package ships a single bundle), append the field ref
to the page's `/Annots`:

- resolves an indirect `/Annots` and mutates it in place (preserves indirection,
  which the library's own flattener documents as required for incremental saves);
- creates a direct `/Annots` array when the page has none;
- dedupes by object number/generation (field reuse via `reuseFirstEmpty`).

The mutation happens before the incremental save inside `sign()`, so the
rewritten page is covered by the signature's `/ByteRange`. Verified: signed
output has the widget in page `/Annots`, and the CMS `messageDigest` matches
the SHA-256 of the ByteRange (signature remains cryptographically valid).

## Repro / verification

```sh
node docs/fork-patches/repro/repro-libpdf-sign.mjs   # needs a throwaway P12, see repro/README.md
```

Unpatched: `FAIL: sig widget N 0 obj is not in any page /Annots (orphan)`.
Patched: PASS.

## Branch/version handling (patch-package files are version-pinned)

- `main` pins `@libpdf/core` 0.3.3 → `patches/@libpdf+core+0.3.3.patch` (active).
- The v2.15.0 sync branch pins 0.4.1 → when merging that branch into `main`,
  swap the patch files:

```sh
rm patches/@libpdf+core+0.3.3.patch
cp docs/fork-patches/v2.15-sync-branch/@libpdf+core+0.4.1.patch patches/
npm install   # postinstall runs patch-package
node docs/fork-patches/repro/repro-libpdf-sign.mjs   # should PASS
```

Both variants were verified: the widget lands in page `/Annots` and the CMS
digest stays valid (checked on 0.3.3 and 0.4.1 on 2026-07-21).

## Removal criteria

Remove this patch when `@libpdf/core` ships a release whose signing path adds
the signature widget to the page `/Annots` (check `prepareSignatureField` in
`dist/index.mjs` on upgrade, or look for an upstream fix at
https://github.com/LibPDF-js/core — consider filing the issue there). When
bumping the package version, regenerate with `npx patch-package @libpdf/core`
after re-applying the fix (patch files are version-pinned by filename).
