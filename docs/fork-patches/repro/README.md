# Fork-patch verification scripts

Run these from the repo root after any `@cantoo/pdf-lib` or `@libpdf/core`
version bump to decide whether the corresponding fork patch is still needed
(see the docs one level up for context and removal criteria).

```sh
# 1) @cantoo/pdf-lib flatten dangling-/Annots repro (no setup needed)
node docs/fork-patches/repro/repro-pdflib-flatten.mjs

# 2) @libpdf/core orphan-sig-widget repro (needs a throwaway P12 next to the script)
cd docs/fork-patches/repro
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 30 -nodes -subj "/CN=repro-test"
openssl pkcs12 -export -out test-cert.p12 -inkey key.pem -in cert.pem -passout pass:test123
cd ../../..
node docs/fork-patches/repro/repro-libpdf-sign.mjs
```

Both print `PASS` when the installed (patched or fixed-upstream) packages are
healthy, and `FAIL` + exit 1 when the bug is present. If a script passes on a
pristine (unpatched) install of a new package version, the matching patch can
be removed.

The sign repro accepts an optional import path argument to test an arbitrary
copy of `@libpdf/core`, e.g. a freshly extracted tarball:

```sh
node docs/fork-patches/repro/repro-libpdf-sign.mjs /tmp/package/dist/index.mjs
```

Do not commit `key.pem` / `cert.pem` / `test-cert.p12`.
