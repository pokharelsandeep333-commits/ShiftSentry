import assert from "node:assert/strict";
import test from "node:test";
import { animateScrollLeft, easeInOutCubic, scrollDurationFor, scrollPositionAt } from "./animate-scroll";

test("easeInOutCubic clamps progress and increases from zero to one", () => {
  assert.equal(easeInOutCubic(-1), 0);
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(0.25), 0.0625);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.equal(easeInOutCubic(0.75), 0.9375);
  assert.equal(easeInOutCubic(1), 1);
  assert.equal(easeInOutCubic(2), 1);
  for (let step = 1; step <= 100; step++) {
    assert.ok(easeInOutCubic(step / 100) >= easeInOutCubic((step - 1) / 100));
  }
});

test("scrollDurationFor scales with absolute distance and clamps the result", () => {
  assert.equal(scrollDurationFor(0, 200), 420);
  assert.equal(scrollDurationFor(200, 200), 560);
  assert.equal(scrollDurationFor(-200, 200), 560);
  assert.equal(scrollDurationFor(1, 200), 421);
  assert.equal(scrollDurationFor(800, 200), 900);
  assert.equal(scrollDurationFor(200, 0), 420);
  assert.equal(scrollDurationFor(200, -1), 420);
});

test("scrollPositionAt eases between the endpoints and returns the exact destination", () => {
  assert.equal(scrollPositionAt(200, 40, -1, 400), 200);
  assert.equal(scrollPositionAt(200, 40, 0, 400), 200);
  assert.equal(scrollPositionAt(200, 40, 100, 400), 190);
  assert.equal(scrollPositionAt(200, 40, 200, 400), 120);
  assert.equal(scrollPositionAt(200, 40, 400, 400), 40);
  assert.equal(scrollPositionAt(200, 40, 450, 400), 40);
  assert.equal(scrollPositionAt(200, 40, 0, 0), 40);
});

function fakeScroll() {
  const writes: ScrollToOptions[] = [];
  const endings: boolean[] = [];
  const frames = new Map<number, (time: number) => void>();
  let time = 1000;
  let nextHandle = 0;
  const fake = {
    scrollLeft: 20,
    clientWidth: 200,
    style: { scrollSnapType: "x mandatory" },
    scrollTo(options: ScrollToOptions) {
      assert.equal(fake.style.scrollSnapType, "none");
      writes.push(options);
      fake.scrollLeft = options.left ?? fake.scrollLeft;
    },
  };
  const el = fake as unknown as HTMLElement;

  return {
    el,
    writes,
    endings,
    frames,
    options: {
      requestFrame(callback: (time: number) => void) {
        const handle = nextHandle++;
        frames.set(handle, callback);
        return handle;
      },
      cancelFrame(handle: number) {
        frames.delete(handle);
      },
      now: () => time,
      onEnd: (completed: boolean) => endings.push(completed),
    },
    step(ms: number) {
      time += ms;
      const next = frames.entries().next().value;
      assert.ok(next, "expected a scheduled frame");
      const [handle, callback] = next;
      frames.delete(handle);
      callback(0);
    },
  };
}

test("animateScrollLeft uses the clock and instant writes, then restores snapping before ending", () => {
  const { el, options, step, writes, frames, endings } = fakeScroll();
  const cancel = animateScrollLeft(el, 220, {
    ...options,
    onEnd(completed) {
      assert.equal(el.style.scrollSnapType, "x mandatory");
      options.onEnd(completed);
    },
  });
  assert.equal(el.style.scrollSnapType, "none");
  step(280);
  assert.equal(el.scrollLeft, 120);
  assert.deepEqual(endings, []);
  step(300);
  assert.equal(el.scrollLeft, 220);
  assert.deepEqual(writes, [
    { left: 120, behavior: "instant" },
    { left: 220, behavior: "instant" },
  ]);
  assert.equal(frames.size, 0);
  cancel();
  assert.deepEqual(endings, [true]);
});

test("animateScrollLeft cancels mid-scroll once and restores an empty inline snap value", () => {
  const { el, options, step, writes, frames, endings } = fakeScroll();
  el.style.scrollSnapType = "";
  const cancel = animateScrollLeft(el, 0, { ...options, durationMs: 200 });
  step(100);
  assert.equal(el.scrollLeft, 10);
  assert.equal(frames.size, 1);
  cancel();
  cancel();
  assert.equal(el.style.scrollSnapType, "");
  assert.equal(frames.size, 0);
  assert.deepEqual(writes, [{ left: 10, behavior: "instant" }]);
  assert.deepEqual(endings, [false]);
});

test("animateScrollLeft completes a subpixel move immediately", () => {
  const { el, options, writes, frames, endings } = fakeScroll();
  const cancel = animateScrollLeft(el, 20.5, options);
  assert.equal(el.scrollLeft, 20.5);
  assert.equal(el.style.scrollSnapType, "x mandatory");
  assert.equal(frames.size, 0);
  assert.deepEqual(writes, [{ left: 20.5, behavior: "instant" }]);
  assert.deepEqual(endings, [true]);
  cancel();
  assert.deepEqual(endings, [true]);
});
