import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  parseTree, serializeTree, changeTree, ensureIdentity, createNode, generateId,
  findPathById, removeCompleted, filterBranch, formatDate, formatDateTime, noteLinkTarget,
} from '../shared/tree.js';

const NOW = new Date(2026, 10, 8, 20, 41); // 2026-11-08T20:41 local
const LATER = new Date(2026, 10, 9, 7, 5);

test('ids are 8-char Crockford base32, start with a letter and avoid taken ids', () => {
  const taken = new Set();
  for (let index = 0; index < 2000; index++) {
    const id = generateId(taken);
    assert.match(id, /^[abcdefghjkmnpqrstvwxyz][0-9abcdefghjkmnpqrstvwxyz]{7}$/);
    assert.ok(!taken.has(id));
    taken.add(id);
  }
});

test('timestamps use local date and minute precision', () => {
  assert.equal(formatDate(NOW), '2026-11-08');
  assert.equal(formatDateTime(NOW), '2026-11-08T20:41');
});

test('design document example round trips unchanged', () => {
  const yaml = [
    '- id: k3f9q2ma',
    '  title: Blogpost',
    '  status: open',
    '  priority: low',
    '  tag: ""',
    '  collapsed: false',
    '  created: 2026-03-02',
    '  updated: 2026-11-08T20:41',
    '  children:',
    '    - id: p7x2c8vd',
    '      title: Myst Online',
    '      status: parked',
    '      priority: low',
    '      tag: ""',
    '      collapsed: false',
    '      note: "[[Blog/Myst Online]]"',
    '      effort: s',
    '      due: 2026-12-24',
    '      created: 2026-03-02',
    '      updated: 2026-11-08T20:41',
    '',
  ].join('\n');
  const tree = parseTree(yaml);
  assert.equal(tree[0].children[0].note, '[[Blog/Myst Online]]');
  assert.equal(tree[0].children[0].effort, 's');
  assert.equal(tree[0].children[0].status, 'parked');
  assert.equal(ensureIdentity(tree, NOW).changed, false);
  assert.equal(serializeTree(tree), yaml);
});

test('unknown fields survive parse, edit and save, including nested values', () => {
  const yaml = [
    '- id: k3f9q2ma',
    '  title: Task',
    '  status: open',
    '  priority: low',
    '  tag: ""',
    '  collapsed: false',
    '  created: 2026-03-02',
    '  updated: 2026-03-02T10:00',
    '  estimate_hours: 3',
    '  links:',
    '    - https://example.com',
    '  meta:',
    '    source: phone',
    '',
  ].join('\n');
  const tree = parseTree(yaml);
  assert.equal(serializeTree(tree), yaml);
  const edited = changeTree(tree, [0], node => { node.title = 'Task renamed'; }, NOW);
  const saved = serializeTree(edited);
  assert.match(saved, /estimate_hours: 3/);
  assert.match(saved, /links:\n {4}- https:\/\/example.com/);
  assert.match(saved, /meta:\n {4}source: phone/);
  assert.equal(parseTree(saved)[0].extra.meta.source, 'phone');
});

test('ensureIdentity fills ids and timestamps once and fixes duplicate ids', () => {
  const tree = parseTree([
    '- title: A',
    '  children:',
    '    - id: abcdefgh',
    '      title: B',
    '      created: 2025-01-01',
    '      updated: 2025-01-01T09:00',
    '    - id: abcdefgh',
    '      title: Copy of B',
  ].join('\n'));
  const { tree: migrated, changed } = ensureIdentity(tree, NOW);
  assert.equal(changed, true);
  assert.match(migrated[0].id, /^[a-z0-9]{8}$/);
  assert.equal(migrated[0].created, '2026-11-08');
  assert.equal(migrated[0].updated, '2026-11-08T20:41');
  // Existing values are kept, the duplicate gets a fresh id.
  assert.equal(migrated[0].children[0].id, 'abcdefgh');
  assert.equal(migrated[0].children[0].created, '2025-01-01');
  assert.notEqual(migrated[0].children[1].id, 'abcdefgh');
  // The input is not mutated, and a second pass is a no-op.
  assert.equal(tree[0].id, undefined);
  assert.equal(ensureIdentity(migrated, LATER).changed, false);
});

test('updated changes on real edits only, never on collapse', () => {
  const [tree] = [ensureIdentity(parseTree('- title: P\n  children:\n    - title: C\n'), NOW).tree];
  const collapsed = changeTree(tree, [0], node => { node.collapsed = true; }, LATER);
  assert.equal(collapsed[0].updated, '2026-11-08T20:41');
  const renamed = changeTree(tree, [0, 0], node => { node.title = 'C2'; }, LATER);
  assert.equal(renamed[0].children[0].updated, '2026-11-09T07:05');
  assert.equal(renamed[0].updated, '2026-11-08T20:41');
  const efforted = changeTree(tree, [0, 0], node => { node.effort = 'xs'; }, LATER);
  assert.equal(efforted[0].children[0].updated, '2026-11-09T07:05');
  const unchanged = changeTree(tree, [0, 0], node => { node.title = 'C'; }, LATER);
  assert.equal(unchanged[0].children[0].updated, '2026-11-08T20:41');
});

test('parked children do not block finishing a parent; reopening an ancestor touches it', () => {
  const tree = ensureIdentity(parseTree([
    '- title: P',
    '  children:',
    '    - title: A',
    '      status: parked',
    '    - title: B',
    '      status: done',
  ].join('\n')), NOW).tree;
  const done = changeTree(tree, [0], node => { node.status = 'done'; }, LATER);
  assert.equal(done[0].status, 'done');
  const reopened = changeTree(done, [0, 0], node => { node.status = 'open'; }, LATER);
  assert.equal(reopened[0].status, 'open');
  assert.equal(reopened[0].updated, '2026-11-09T07:05');
  // Clean up removes done tasks only, parked ones stay.
  const cleaned = removeCompleted(changeTree(tree, [0, 1], node => node, LATER));
  assert.deepEqual(cleaned[0].children.map(child => child.title), ['A']);
});

test('invalid new fields are rejected with a clear message', () => {
  assert.throws(() => parseTree('- title: T\n  effort: huge\n'), /effort must be xs, s, m, or l/);
  assert.throws(() => parseTree('- title: T\n  due: next week\n'), /due must be an ISO date/);
  assert.throws(() => parseTree('- title: T\n  id: TOO-LONG-ID\n'), /id must be 8/);
  assert.throws(() => parseTree('- title: T\n  status: blocked\n'), /open, doing, done, or parked/);
});

test('createNode and findPathById', () => {
  const node = createNode({ title: 'New', effort: 'xs' }, new Set(), NOW);
  assert.equal(node.created, '2026-11-08');
  assert.equal(node.effort, 'xs');
  const tree = parseTree(serializeTree([{ ...createNode({ title: 'Root' }, new Set(), NOW), children: [node] }]));
  assert.deepEqual(findPathById(tree, node.id), [0, 0]);
  assert.equal(findPathById(tree, 'zzzzzzzz'), null);
});

test('note link targets strip brackets, headings and aliases', () => {
  assert.equal(noteLinkTarget('[[Blog/Myst Online]]'), 'Blog/Myst Online');
  assert.equal(noteLinkTarget('[[Blog/Myst Online|Myst]]'), 'Blog/Myst Online');
  assert.equal(noteLinkTarget('[[Blog/Myst Online#Ideas]]'), 'Blog/Myst Online');
  assert.equal(noteLinkTarget('Ideas/Plain'), 'Ideas/Plain');
  assert.equal(noteLinkTarget(undefined), '');
});

// Phase 0 acceptance: the real tasks.tree migrates without visible change.
const realTree = new URL('../../tasks.tree', import.meta.url);
test('real tasks.tree migrates without changing anything visible', { skip: !existsSync(realTree) }, () => {
  const text = readFileSync(realTree, 'utf8');
  const before = parseTree(text);
  const { tree: migrated, changed } = ensureIdentity(before, NOW);
  assert.equal(changed, true);
  const after = parseTree(serializeTree(migrated));
  const visible = nodes => nodes.map(({ title, status, priority, tag, collapsed, children }) => ({
    title, status, priority, tag, collapsed, children: visible(children),
  }));
  assert.deepEqual(visible(after), visible(before));
  // Ids survive another save untouched.
  const ids = JSON.stringify(after, ['id', 'children']);
  const resaved = parseTree(serializeTree(ensureIdentity(after, LATER).tree));
  assert.equal(JSON.stringify(resaved, ['id', 'children']), ids);
});

test('a focused branch keeps real paths, so actions hit the focused task and not its first child', () => {
  const tree = parseTree([
    '- title: A',
    '- title: B',
    '  children:',
    '    - title: B1',
    '    - title: B2',
    '      children:',
    '        - title: B2a',
  ].join('\n'));
  const [root] = filterBranch(tree, [1], {});
  assert.deepEqual(root.realPath, [1]);
  assert.deepEqual(root.children.map(child => child.realPath), [[1, 0], [1, 1]]);
  assert.deepEqual(root.children[1].children[0].realPath, [1, 1, 0]);
  const [deep] = filterBranch(tree, [1, 1], { status: 'open' });
  assert.deepEqual(deep.realPath, [1, 1]);
  assert.deepEqual(deep.children[0].realPath, [1, 1, 0]);
});
