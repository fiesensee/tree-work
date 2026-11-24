import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isTitleOverflowing, toggleTitleExpanded, TITLE_LINE_CLAMP } from '../src/title-overflow.js';

test('title truncation: detects content taller than the clamped title box', () => {
  assert.equal(isTitleOverflowing({ scrollHeight: 96, clientHeight: 72 }), true);
  assert.equal(isTitleOverflowing({ scrollHeight: 72, clientHeight: 72 }), false);
  assert.equal(isTitleOverflowing({ scrollHeight: 70, clientHeight: 72 }), false);
  assert.equal(isTitleOverflowing({ scrollHeight: 72.5, clientHeight: 72 }), false, 'rounding tolerance');
  assert.equal(isTitleOverflowing({ scrollHeight: 76, clientHeight: 72 }), true);
  assert.equal(isTitleOverflowing(null), false);
});

test('title truncation: toggling switches between show more and show less', () => {
  assert.equal(toggleTitleExpanded(false), true);
  assert.equal(toggleTitleExpanded(true), false);
  assert.equal(toggleTitleExpanded(toggleTitleExpanded(false)), false);
});

test('title truncation: styles clamp titles to three lines and remove the clamp when expanded', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const titleRule = css.match(/\.tree-work-root \.task-title \{([^}]*)\}/);
  assert.ok(titleRule, 'task-title rule exists');
  assert.equal(TITLE_LINE_CLAMP, 3);
  assert.match(titleRule[1], /-webkit-line-clamp:\s*3/);
  assert.match(titleRule[1], /-webkit-box-orient:\s*vertical/);
  const expandedRule = css.match(/\.tree-work-root \.task-title\.expanded \{([^}]*)\}/);
  assert.ok(expandedRule, 'expanded title rule exists');
  assert.match(expandedRule[1], /-webkit-line-clamp:\s*unset/);
});
