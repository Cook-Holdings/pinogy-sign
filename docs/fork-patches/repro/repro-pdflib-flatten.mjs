// Repro for @cantoo/pdf-lib PDFForm.flatten() leaving dangling /Annots refs.
// Mirrors seal-document.handler.ts V1 path: create acroFields via addToPage, flatten, save.
// PASS = every /Annots entry in the saved bytes resolves to a live object.
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from '@cantoo/pdf-lib';

const doc = await PDFDocument.create();
const page = doc.addPage([612, 792]);

const form = doc.getForm();
const cb1 = form.createCheckBox('checkbox.f1.0');
cb1.addToPage(page, { x: 50, y: 700, width: 12, height: 12 });
cb1.check();
const cb2 = form.createCheckBox('checkbox.f1.1');
cb2.addToPage(page, { x: 50, y: 680, width: 12, height: 12 });
const tf = form.createTextField('text.f2');
tf.setText('hello');
tf.addToPage(page, { x: 50, y: 640, width: 200, height: 16 });

form.flatten();

const bytes = await doc.save({ useObjectStreams: false });

// Reload with a fresh parser and check every page /Annots ref resolves.
const reloaded = await PDFDocument.load(bytes);
let dangling = 0;
let total = 0;
for (const p of reloaded.getPages()) {
  const annots = p.node.get(PDFName.of('Annots'));
  const arr = annots instanceof PDFRef ? reloaded.context.lookup(annots) : annots;
  if (!(arr instanceof PDFArray)) {
    continue;
  }
  for (let i = 0; i < arr.size(); i++) {
    const ref = arr.get(i);
    if (!(ref instanceof PDFRef)) {
      continue;
    }
    total++;
    const target = reloaded.context.lookup(ref);
    if (!(target instanceof PDFDict)) {
      dangling++;
      console.log(`DANGLING: /Annots entry ${ref.toString()} resolves to`, target?.toString?.() ?? target);
    }
  }
}
console.log(`annots refs checked: ${total}, dangling: ${dangling}`);
if (dangling > 0) {
  console.log('FAIL: flatten left dangling /Annots references');
  process.exit(1);
}
console.log('PASS');
