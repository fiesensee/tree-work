import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTree, serializeTree, changeTree } from '../shared/tree.js';
import { createStore } from '../server/storage.js';

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

test('storage persists and serializes competing writes without data loss', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tree-work-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'tasks.txt');
  const store = createStore(file);
  const original = await store.read();
  const tree = parseTree('- [ ] Saved task\n');
  const writes = await Promise.allSettled([store.save(tree, original.revision), store.save([], original.revision)]);
  assert.equal(writes[0].status, 'fulfilled');
  assert.equal(writes[1].reason.status, 409);
  assert.deepEqual((await createStore(file).read()).tree, tree);
  assert.equal(await readFile(file, 'utf8'), '- [ ] Saved task\n');
  const loaded = await store.read();
  await writeFile(file, '- [ ] Edited outside the app\n');
  await assert.rejects(store.save(tree, loaded.revision), { status: 409 });
  await writeFile(file, 'malformed file');
  await assert.rejects(store.read(), /Line 1/);
  await assert.rejects(store.save(tree, loaded.revision));
  assert.equal(await readFile(file, 'utf8'), 'malformed file');
});
