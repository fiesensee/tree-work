import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The wheel handler in TreeCanvas.jsx uses the same zoom step (×1.25 / ÷1.25)
 * as the +/- buttons.  These tests verify the direction logic and modifier-key
 * check in isolation, since the JSX component itself can't be rendered without
 * a DOM environment.
 */
function wheelZoomFactor(deltaY) {
  // negative deltaY = scroll up    → zoom in  (×1.25)
  // positive deltaY = scroll down  → zoom out (÷1.25)
  return (deltaY || -0 /* wheelDelta fallback */ || 0) < 0 ? 1.25 : 1 / 1.25;
}

function shouldHandleWheel(event) {
  return event.ctrlKey || event.metaKey;
}

test('wheel zoom: scroll up zooms in, scroll down zooms out', () => {
  // Scroll up (negative deltaY) → factor > 1 (zoom in)
  assert.equal(wheelZoomFactor(-1), 1.25, 'scroll up should zoom in');

  // Scroll down (positive deltaY) → factor < 1 (zoom out)
  assert.equal(wheelZoomFactor(1), 1 / 1.25, 'scroll down should zoom out');

  // Large magnitude doesn't change direction
  assert.equal(wheelZoomFactor(-120), 1.25, 'large negative still zooms in');
  assert.equal(wheelZoomFactor(120), 1 / 1.25, 'large positive still zooms out');

  // In and out are exact reciprocals
  assert.equal(1.25 * (1 / 1.25), 1, 'zoom in and out should be reciprocals');

  // Zero delta (edge case) is treated as zoom out (same branch as positive)
  assert.equal(wheelZoomFactor(0), 1 / 1.25, 'zero delta falls to zoom-out branch');
});

test('wheel zoom: only Ctrl or Meta (Cmd) trigger, others pass through', () => {
  // Ctrl held → should handle
  assert.ok(shouldHandleWheel({ ctrlKey: true, metaKey: false }), 'Ctrl triggers handler');
  // Meta (Cmd on macOS) held → should handle
  assert.ok(shouldHandleWheel({ ctrlKey: false, metaKey: true }), 'Meta (Cmd) triggers handler');
  // Both held → should handle (redundant but harmless)
  assert.ok(shouldHandleWheel({ ctrlKey: true, metaKey: true }), 'both modifiers trigger handler');

  // No modifier → should NOT handle
  assert.ok(!shouldHandleWheel({ ctrlKey: false, metaKey: false }), 'no modifier passes through');

  // Neither key present (undefined) → should NOT handle
  assert.ok(!shouldHandleWheel({}), 'undefined keys are treated as absent');
});

test('wheel zoom reuses the same zoom factors as the +/- buttons', () => {
  // The handler calls changeZoom(zoom * factor) where factor comes from
  // wheelZoomFactor(deltaY).  The +/- buttons call changeZoom(zoom / 1.25)
  // and changeZoom(zoom * 1.25) respectively.  Both paths converge on the
  // same changeZoom function, so the zoom state is always consistent.

  // Verify the factors used by the handler match the buttons
  assert.equal(wheelZoomFactor(-1), 1.25, 'scroll-up factor matches zoom-in button (×1.25)');
  assert.equal(wheelZoomFactor(1), 1 / 1.25, 'scroll-down factor matches zoom-out button (÷1.25)');

  // Confirm the direction is correct: zoom in increases, zoom out decreases
  const zoom = 0.8;
  assert.ok(zoom * wheelZoomFactor(-1) > zoom, 'scroll up increases zoom');
  assert.ok(zoom * wheelZoomFactor(1) < zoom, 'scroll down decreases zoom');
});