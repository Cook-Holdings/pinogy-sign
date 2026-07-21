// Repro for @libpdf/core sign() creating a signature widget that is never
// referenced from any page's /Annots array (orphan widget).
// Usage: node repro-libpdf-sign.mjs <libpdf-import-path>
// PASS = the /FT /Sig widget object number appears in the first page's /Annots.
import fs from 'node:fs';
import { PDFDocument } from '@cantoo/pdf-lib';

const libpdfPath = process.argv[2] ?? '@libpdf/core';
const { PDF, P12Signer } = await import(libpdfPath);

// Build a minimal one-page PDF.
const doc = await PDFDocument.create();
doc.addPage([612, 792]);
const inputBytes = await doc.save({ useObjectStreams: false });

const p12 = fs.readFileSync(new URL('./test-cert.p12', import.meta.url));
const signer = await P12Signer.create(new Uint8Array(p12), 'test123', { buildChain: true });

const pdf = await PDF.load(new Uint8Array(inputBytes));
const { bytes } = await pdf.sign({ signer, reason: 'repro', subFilter: 'ETSI.CAdES.detached' });

const text = Buffer.from(bytes).toString('latin1');

// Find the signature field/widget object number: "<N> 0 obj" whose body has /FT /Sig.
const objRe = /(\d+) 0 obj\n?([\s\S]*?)endobj/g;
let sigFieldNum = null;
const pages = [];
let m;
while ((m = objRe.exec(text)) !== null) {
  if (/\/FT\s*\/Sig/.test(m[2]) && /\/Subtype\s*\/Widget/.test(m[2])) {
    sigFieldNum = m[1];
  }
  if (/\/Type\s*\/Page[^s]/.test(m[2])) {
    pages.push({ num: m[1], body: m[2] });
  }
}
if (!sigFieldNum) {
  console.log('FAIL: no signature widget object found at all');
  process.exit(1);
}
// Collect every /Annots array in the file (pages may be rewritten incrementally;
// the LAST occurrence of each page object wins, objRe iterates in file order).
const lastPageBodies = new Map();
for (const p of pages) {
  lastPageBodies.set(p.num, p.body);
}
let referenced = false;
for (const [num, body] of lastPageBodies) {
  const am = body.match(/\/Annots\s*\[([^\]]*)\]/);
  if (am && new RegExp(`(?:^|[^0-9])${sigFieldNum} 0 R`).test(am[1])) {
    console.log(`sig widget ${sigFieldNum} referenced from page ${num} /Annots [${am[1].trim()}]`);
    referenced = true;
  }
}
if (!referenced) {
  console.log(`FAIL: sig widget ${sigFieldNum} 0 obj is not in any page /Annots (orphan)`);
  process.exit(1);
}
console.log('PASS');
