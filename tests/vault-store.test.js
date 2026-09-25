import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVaultStore } from '../src/obsidian/vault-store.js';
import { createTreeFile } from '../src/obsidian/create-tree.js';
import { changeTree, parseTree } from '../shared/tree.js';

// Exercises the storage contract without opening or automating Obsidian.
function fakeVault(initial = {}) {
  const files = new Map(Object.entries(initial).map(([path, text]) => [path, { file: { path }, text }]));
  const listeners = new Set();
  let writes = Promise.resolve();
  function entry(file) {
    const record = files.get(file.path);
    if (!record || record.file !== file) throw new Error('File no longer exists.');
    return record;
  }
  const vault = {
    on(event, listener) { assert.equal(event, 'modify'); listeners.add(listener); return listener; },
    offref(listener) { listeners.delete(listener); },
    async read(file) { return entry(file).text; },
    process(file, callback) {
      const operation = writes.then(() => {
        const record = entry(file);
        const result = callback(record.text);
        record.text = result;
        for (const listener of listeners) listener(file);
        return result;
      });
      writes = operation.catch(() => {});
      return operation;
    },
    getAbstractFileByPath(path) { return files.get(path)?.file ?? null; },
    async create(path, text) {
      if (files.has(path)) throw new Error('File already exists.');
      const file = { path };
      files.set(path, { file, text });
      return file;
    },
    rename(file, path) {
      const record = entry(file);
      files.delete(file.path);
      file.path = path;
      files.set(path, record);
    },
    listeners,
  };
  return vault;
}

test('vault saves retain the checklist format and notify only other panes', async () => {
  const vault = fakeVault({ 'Work.tree': '- [ ] Project\n  - [ ] Child\n' });
  const file = vault.getAbstractFileByPath('Work.tree');
  const first = createVaultStore(vault, file);
  const second = createVaultStore(vault, file);
  let ownChanges = 0;
  let otherChanges = 0;
  first.subscribe(() => ownChanges++);
  second.subscribe(() => otherChanges++);
  const loaded = await first.read();
  const stale = await second.read();
  const next = changeTree(loaded.tree, [0, 0], node => { node.done = true; });
  await first.save(next, loaded.revision);
  assert.equal(await vault.read(file), '- [ ] Project\n  - [x] Child\n');
  assert.equal(ownChanges, 0);
  assert.equal(otherChanges, 1);
  await assert.rejects(second.save(stale.tree, stale.revision), /changed in another pane/);
  assert.equal((await second.read()).tree[0].children[0].done, true);
  first.dispose(); second.dispose();
  assert.equal(vault.listeners.size, 0);
});

test('atomic revision checks reject competing saves and preserve external edits', async () => {
  const vault = fakeVault({ 'Work.tree': '' });
  const file = vault.getAbstractFileByPath('Work.tree');
  const one = createVaultStore(vault, file);
  const two = createVaultStore(vault, file);
  const revision = (await one.read()).revision;
  await two.read();
  const attempts = await Promise.allSettled([
    one.save(parseTree('- [ ] First\n'), revision),
    two.save(parseTree('- [ ] Second\n'), revision),
  ]);
  assert.equal(attempts[0].status, 'fulfilled');
  assert.equal(attempts[1].status, 'rejected');
  const loaded = await one.read();
  await vault.process(file, () => '- [ ] External edit\n');
  await assert.rejects(one.save([], loaded.revision), /changed in another pane/);
  assert.equal(await vault.read(file), '- [ ] External edit\n');
  one.dispose(); two.dispose();
});

test('malformed files and invalid completion states cannot be overwritten', async () => {
  const vault = fakeVault({ 'Broken.tree': 'not a checklist', 'Valid.tree': '- [ ] Parent\n  - [ ] Child\n' });
  const file = vault.getAbstractFileByPath('Broken.tree');
  const broken = createVaultStore(vault, file);
  await assert.rejects(broken.read(), /Line 1/);
  await assert.rejects(broken.save([], 'not a checklist'), /Line 1/);
  assert.equal(await vault.read(file), 'not a checklist');
  const valid = createVaultStore(vault, vault.getAbstractFileByPath('Valid.tree'));
  const loaded = await valid.read();
  loaded.tree[0].done = true;
  await assert.rejects(valid.save(loaded.tree, loaded.revision), /Finish every subtask/);
  broken.dispose(); valid.dispose();
});

test('stores follow renames, remain file-bound, and reject use after disposal', async () => {
  const vault = fakeVault({ 'Original.tree': '', 'Other.tree': '- [ ] Untouched\n' });
  const file = vault.getAbstractFileByPath('Original.tree');
  const store = createVaultStore(vault, file);
  const loaded = await store.read();
  vault.rename(file, 'Renamed.tree');
  await store.save(parseTree('- [ ] Saved after rename\n'), loaded.revision);
  assert.equal(await vault.read(file), '- [ ] Saved after rename\n');
  assert.equal(await vault.read(vault.getAbstractFileByPath('Other.tree')), '- [ ] Untouched\n');
  store.dispose();
  await assert.rejects(store.read(), /closed/);
  await assert.rejects(store.save([], ''), /closed/);
});

test('focused edits reopen hidden ancestors and preserve unrelated roots', async () => {
  const vault = fakeVault({ 'Work.tree': '- [x] Parent\n  - [x] Focused\n    - [x] Leaf\n- [ ] Other\n' });
  const store = createVaultStore(vault, vault.getAbstractFileByPath('Work.tree'));
  const loaded = await store.read();
  const next = changeTree(loaded.tree, [0, 0, 0], node => { node.done = false; });
  await store.save(next, loaded.revision);
  const saved = (await store.read()).tree;
  assert.equal(saved[0].done, false);
  assert.equal(saved[0].children[0].done, false);
  assert.deepEqual(saved[1], loaded.tree[1]);
  store.dispose();
});

test('new trees use .tree, respect folders, and never overwrite existing files', async () => {
  const vault = fakeVault({ 'Projects/Work.tree': '- [ ] Keep me\n' });
  const file = await createTreeFile(vault, 'Projects', 'Work.tree');
  assert.equal(file.path, 'Projects/Work 2.tree');
  assert.equal(await vault.read(file), '');
  assert.equal(await vault.read(vault.getAbstractFileByPath('Projects/Work.tree')), '- [ ] Keep me\n');
  assert.equal((await createTreeFile(vault, '/', 'New')).path, 'New.tree');
  for (const name of ['', '../outside', 'folder/name', '.tree', 'nul', 'task.']) {
    await assert.rejects(createTreeFile(vault, '/', name), /file name/);
  }
});
