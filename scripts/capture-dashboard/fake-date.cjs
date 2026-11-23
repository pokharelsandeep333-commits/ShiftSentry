// Preloaded into `next start` by scripts/capture-dashboard.mjs (NODE_OPTIONS
// --require): pins the server clock to the landing's sample week, still
// ticking, so the demo dashboard (`demoDashboardFor(new Date())`) shows the
// Wednesday evening the landing's alt text describes.
//
// The subclass carries its own `parse` and `UTC`: Next copies only Date's own
// statics onto its patched Date, and inherited ones would vanish
// ("Date.parse is not a function").
const RealDate = Date;
const pinned = process.env.CAPTURE_CLOCK || "2026-11-19T18:00:00Z";
const offset = RealDate.parse(pinned) - RealDate.now();
if (Number.isNaN(offset)) throw new Error(`fake-date: CAPTURE_CLOCK is not a date: ${pinned}`);

class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...args);
  }
  static now() { return RealDate.now() + offset; }
  static parse(value) { return RealDate.parse(value); }
  static UTC(...args) { return RealDate.UTC(...args); }
}

globalThis.Date = FakeDate;
