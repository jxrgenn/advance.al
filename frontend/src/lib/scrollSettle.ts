/**
 * waitForScrollSettle — runs `cb` once an element has stopped moving.
 *
 * Smooth `scrollIntoView` has no reliable completion callback and its duration
 * varies with scroll distance, so a fixed setTimeout often measures the element
 * mid-scroll and places a tutorial spotlight at a stale position. This polls
 * `getBoundingClientRect().top` via requestAnimationFrame until it is stable for
 * a few consecutive frames (or a hard cap elapses), then fires the callback.
 *
 * @param element  the element being scrolled to
 * @param cb       called once, after the scroll has settled
 * @param opts.stableFrames  consecutive stable frames required (default 3)
 * @param opts.maxWaitMs     hard cap so a never-settling case still resolves (default 1000)
 */
export function waitForScrollSettle(
  element: HTMLElement,
  cb: () => void,
  opts: { stableFrames?: number; maxWaitMs?: number } = {}
): void {
  const stableFramesNeeded = opts.stableFrames ?? 3;
  const maxWaitMs = opts.maxWaitMs ?? 1000;

  const deadline = performance.now() + maxWaitMs;
  let lastTop: number | null = null;
  let stableCount = 0;
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    cb();
  };

  const tick = () => {
    if (done) return;
    const top = element.getBoundingClientRect().top;

    if (lastTop !== null && Math.abs(top - lastTop) < 0.5) {
      stableCount += 1;
    } else {
      stableCount = 0;
    }
    lastTop = top;

    if (stableCount >= stableFramesNeeded) {
      finish();
      return;
    }
    if (performance.now() >= deadline) {
      finish();
      return;
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}
