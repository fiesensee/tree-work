export const TITLE_LINE_CLAMP = 3;

// A title is truncated when its full content is taller than the clamped box.
// The small tolerance absorbs sub-pixel rounding differences.
export function isTitleOverflowing(element, tolerance = 1) {
  if (!element) return false;
  const scrollHeight = Number(element.scrollHeight);
  const clientHeight = Number(element.clientHeight);
  if (!Number.isFinite(scrollHeight) || !Number.isFinite(clientHeight)) return false;
  return scrollHeight > clientHeight + tolerance;
}

export function toggleTitleExpanded(expanded) {
  return !expanded;
}
