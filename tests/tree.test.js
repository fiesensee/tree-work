import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTree, serializeTree, changeTree, deleteNode, removeCompleted, statistics, getErrorMessage } from '../shared/tree.js';

test('getErrorMessage safely extracts messages from Error instances and non-Error values', () => {
  assert.equal(getErrorMessage(new Error('Sample error')), 'Sample error');
  assert.equal(getErrorMessage('Raw string error'), 'Raw string error');
  assert.equal(getErrorMessage(404), '404');
  assert.equal(getErrorMessage(null), 'null');
  assert.equal(getErrorMessage(undefined), 'undefined');
});


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

test('deleteNode removes root tasks and nested subtasks safely', () => {
  const input = '- [ ] Task 1\n  - [ ] Sub 1.1\n  - [ ] Sub 1.2\n- [ ] Task 2\n';
  const tree = parseTree(input);

  // Delete subtask 1.1
  const afterSubDelete = deleteNode(tree, [0, 0]);
  assert.equal(afterSubDelete[0].children.length, 1);
  assert.equal(afterSubDelete[0].children[0].title, 'Sub 1.2');

  // Delete root Task 1
  const afterRootDelete = deleteNode(afterSubDelete, [0]);
  assert.equal(afterRootDelete.length, 1);
  assert.equal(afterRootDelete[0].title, 'Task 2');

  // Delete last task
  const empty = deleteNode(afterRootDelete, [0]);
  assert.deepEqual(empty, []);
  assert.equal(serializeTree(empty), '');

  // Invalid path errors
  assert.throws(() => deleteNode(tree, []), /path/);
  assert.throws(() => deleteNode(tree, [5]), /exist/);
});

test('removeCompleted removes all done tasks across all levels', () => {
  const input = [
    '- [ ] Root 1',
    '  - [x] Sub 1 (done)',
    '  - [ ] Sub 2 (not done)',
    '    - [x] Sub 2.1 (done)',
    '    - [ ] Sub 2.2 (not done)',
    '- [x] Root 2 (done)',
    '  - [x] Sub 2.1 (done)',
    '- [ ] Root 3 (empty)',
  ].join('\n') + '\n';

  const tree = parseTree(input);
  assert.equal(statistics(tree).done, 4);

  const cleaned = removeCompleted(tree);
  assert.equal(statistics(cleaned).done, 0);
  assert.equal(statistics(cleaned).total, 4);

  // Expected surviving structure:
  // - [ ] Root 1
  //   - [ ] Sub 2 (not done)
  //     - [ ] Sub 2.2 (not done)
  // - [ ] Root 3 (empty)
  const expected = [
    '- [ ] Root 1',
    '  - [ ] Sub 2 (not done)',
    '    - [ ] Sub 2.2 (not done)',
    '- [ ] Root 3 (empty)',
  ].join('\n') + '\n';
  assert.equal(serializeTree(cleaned), expected);

  // When all are completed, cleans to empty
  const allDoneInput = '- [x] A\n  - [x] B\n';
  assert.deepEqual(removeCompleted(parseTree(allDoneInput)), []);

  // When none are completed, leaves untouched
  const noneDoneInput = '- [ ] A\n  - [ ] B\n';
  assert.deepEqual(removeCompleted(parseTree(noneDoneInput)), parseTree(noneDoneInput));
});



