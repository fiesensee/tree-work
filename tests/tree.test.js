import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTree, serializeTree, changeTree } from '../shared/tree.js';

test('round trips nested tasks, Unicode, and checklist-like titles', () => {
  const input = '- [ ] Plan 🌱\n  - [x] First: [draft]\n  - [ ] Next\n    - [ ] Deep task\n';
  assert.equal(serializeTree(parseTree(input)), input);
  assert.equal(serializeTree(parseTree('\uFEFF' + input.replaceAll('\n', '\r\n'))), input);
  assert.deepEqual(parseTree(' \n'), []);
});

test('rejects malformed indentation and impossible completed parents', () => {
  for (const input of [' - [ ] Odd indent', '  - [ ] No parent', '- [ ] Parent\n    - [ ] Skipped level', '- [x] Parent\n  - [ ] Child', '- [ ] \tBad title']) {
    assert.throws(() => parseTree(input));
  }
});

test('parents are manually finishable only when all descendants are done', () => {
  const tree = parseTree('- [ ] Parent\n  - [ ] Child\n    - [ ] Leaf\n');
  assert.throws(() => changeTree(tree, [0], node => { node.done = true; }));
  const leafDone = changeTree(tree, [0, 0, 0], node => { node.done = true; });
  assert.equal(leafDone[0].done, false);
  const childDone = changeTree(leafDone, [0, 0], node => { node.done = true; });
  const allDone = changeTree(childDone, [0], node => { node.done = true; });
  assert.equal(allDone[0].done, true);
  const reopened = changeTree(allDone, [0, 0, 0], node => { node.done = false; });
  assert.equal(reopened[0].done, false);
  assert.equal(reopened[0].children[0].done, false);
  assert.equal(allDone[0].done, true);
});

test('adding a child reopens completed ancestors', () => {
  const tree = parseTree('- [x] Parent\n  - [x] Child\n');
  const result = changeTree(tree, [0, 0], node => { node.children.push({ title: 'New', done: false, children: [] }); });
  assert.equal(result[0].done, false);
  assert.equal(result[0].children[0].done, false);
});


