# Patch: @cantoo/pdf-lib — `form.flatten()` leaves dangling `/Annots` refs

**Patch file:** `patches/@cantoo+pdf-lib+2.5.3.patch`
**Package version:** `@cantoo/pdf-lib` 2.5.3 (same version on `main` and the v2.15.0 sync branch — one patch file serves both)
**Marker in code:** `PINOGY-PATCH(pdf-annots-dangling-refs)`
**Added:** 2026-07-21

## Problem

`PDFForm.removeField()` (called for every field by `PDFForm.flatten()`) is supposed to
remove each widget annotation from its page's `/Annots` array before deleting the
widget objects. Instead it calls:

```js
const widgetRef = this.findWidgetAppearanceRef(field, widget); // returns the /AP appearance STREAM ref
page.node.removeAnnot(widgetRef);                              // no-op: appearance refs are never in /Annots
```

For fields whose widgets are separate kid objects — exactly what
`insertFieldInPDFV1` produces via `createCheckBox` / `createRadioGroup` /
`createTextField` + `addToPage()` — the widget refs stay in `/Annots` while the
loop below (`this.doc.context.delete(child)`) deletes the widget objects. The
sealed PDF then contains `/Annots` entries pointing at objects that do not exist.

Adobe Acrobat treats refs to nonexistent objects in `/Annots` as structural
damage; when it repairs/re-serializes (e.g. at print time) it drops the digital
signatures.

Forensic evidence: `Signed paperwork 5513` (sealed 2026-07-20) — pages `8 0 R` /
`9 0 R` carried `/Annots [412 0 R … 440 0 R]` with objects 407–441 absent from
the file, alongside the `FlatWidget-*` XObjects that prove `flatten()` processed
those widgets.

## Fix

In `removeField()`, additionally resolve the true widget annotation ref and
remove it:

```js
const widgetDictRef = this.doc.context.getObjectRef(widget.dict);
if (widgetDictRef) page.node.removeAnnot(widgetDictRef);
```

Patched files: `cjs/api/form/PDFForm.js`, `es/api/form/PDFForm.js` (runtime) and
`src/api/form/PDFForm.ts` (reference).

## Repro / verification

```sh
node docs/fork-patches/repro/repro-pdflib-flatten.mjs
```

Creates a doc with checkbox + text fields via `addToPage()`, runs
`form.flatten()`, saves, reloads, and asserts every `/Annots` entry resolves to
a live object. Unpatched: 3 dangling refs (FAIL). Patched: 0 (PASS). See
`docs/fork-patches/repro/README.md`.

## Removal criteria

**Preferred removal path: bump `@cantoo/pdf-lib` to >=2.7.0.** The fork fixed
this upstream — verified 2026-07-21: pristine 2.7.4's `removeField` uses
`this.doc.context.getObjectRef(widget.dict)` (the same fix as this patch) and
the repro script passes against it with no patch. The bump was deliberately NOT
taken now because a 2.5.3 → 2.7.x jump needs regression testing on field
appearance/positioning across sealed documents; both `main` and the v2.15.0
sync branch pin/lock 2.5.3.

Remove this patch when **any** of:

1. `@cantoo/pdf-lib` is bumped to >=2.7.0 (after appearance/positioning
   regression testing) — patch-package will refuse the 2.5.3-pinned patch file
   on the new version anyway; delete it and run
   `node docs/fork-patches/repro/repro-pdflib-flatten.mjs` to confirm; **or**
2. `@cantoo/pdf-lib` ships another release whose `PDFForm.removeField` removes
   the actual widget ref — check the method body on upgrade; **or**
3. The V1 sealing path (`legacy_pdfLibDoc.getForm().flatten()` in
   `packages/lib/jobs/definitions/internal/seal-document.handler.ts`) is retired
   and no code path calls `PDFForm.flatten()`/`removeField()` on documents with
   checkbox/radio/text acroFields.

Note: upstream `Hopding/pdf-lib` (master, checked 2026-07-21) still has the
bug; the fix exists only in the @cantoo fork >=2.7.0. If staying on a version
below 2.7.0 while bumping (e.g. 2.6.x), diff `removeField` first and regenerate
with `npx patch-package @cantoo/pdf-lib` after re-applying the fix (patch files
are version-pinned by filename).
