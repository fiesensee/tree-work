import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTree, serializeTree, changeTree, deleteNode, removeCompleted, statistics, getErrorMessage, setBranchesCollapsed, getAllTags, filterTree } from '../shared/tree.js';

test('getErrorMessage safely extracts messages from Error instances and non-Error values', () => {
  assert.equal(getErrorMessage(new Error('Sample error')), 'Sample error');
  assert.equal(getErrorMessage('Raw string error'), 'Raw string error');
  assert.equal(getErrorMessage(404), '404');
  assert.equal(getErrorMessage(null), 'null');
  assert.equal(getErrorMessage(undefined), 'undefined');
});

test('round trips YAML tasks with status, priority, tag, collapsed and nested hierarchy', () => {
  const tree = [
    {
      title: 'Plan 🌱',
      status: 'open',
      priority: 'high',
      tag: 'roadmap',
      collapsed: false,
      children: [
        {
          title: 'First: [draft]',
          status: 'done',
          priority: 'medium',
          tag: 'v1',
          collapsed: false,
          children: []
        },
        {
          title: 'Next',
          status: 'doing',
          priority: 'low',
          tag: 'wip',
          collapsed: true,
          children: [
            {
              title: 'Deep task',
              status: 'open',
              priority: 'medium',
              tag: '',
              collapsed: false,
              children: []
            }
          ]
        }
      ]
    }
  ];
  const yaml = serializeTree(tree);
  const parsed = parseTree(yaml);
  assert.equal(parsed[0].title, 'Plan 🌱');
  assert.equal(parsed[0].status, 'open');
  assert.equal(parsed[0].priority, 'high');
  assert.equal(parsed[0].tag, 'roadmap');
  assert.equal(parsed[0].collapsed, false);
  assert.equal(parsed[0].children[0].status, 'done');
  assert.equal(parsed[0].children[1].status, 'doing');
  assert.equal(parsed[0].children[1].collapsed, true);
  assert.equal(parsed[0].children[1].children[0].title, 'Deep task');
  assert.equal(serializeTree(parsed), yaml);

  // Empty input handling
  assert.deepEqual(parseTree(' \n'), []);
  assert.deepEqual(parseTree(''), []);
  assert.equal(serializeTree([]), '');
});

test('backwards compatibility: parses legacy markdown checklist format with default attributes', () => {
  const legacy = '- [ ] Plan 🌱\n  - [x] First: [draft]\n  - [ ] Next\n    - [ ] Deep task\n';
  const tree = parseTree(legacy);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].title, 'Plan 🌱');
  assert.equal(tree[0].status, 'open');
  assert.equal(tree[0].priority, 'low');
  assert.equal(tree[0].tag, '');
  assert.equal(tree[0].collapsed, false);
  assert.equal(tree[0].children[0].status, 'done');
  assert.equal(tree[0].children[0].done, true);
});

test('rejects malformed syntax, invalid attributes, and impossible completed parents', () => {
  // Invalid YAML / non-list
  assert.throws(() => parseTree('title: not a list'), /list/);
  assert.throws(() => parseTree('{ bad: [ yaml'), /YAML syntax/);

  // Invalid attributes
  assert.throws(() => parseTree('- title: Task\n  status: invalid_status\n'), /status/);
  assert.throws(() => parseTree('- title: Task\n  priority: urgent\n'), /priority/);

  // Impossible completed parent
  assert.throws(() => parseTree([
    '- title: Parent',
    '  status: done',
    '  children:',
    '    - title: Child',
    '      status: open',
  ].join('\n')), /Finish every subtask/);
});

test('parents are manually finishable only when all descendants are done', () => {
  const tree = parseTree([
    '- title: Parent',
    '  status: open',
    '  children:',
    '    - title: Child',
    '      status: open',
    '      children:',
    '        - title: Leaf',
    '          status: open',
  ].join('\n'));

  // Cannot finish parent while children are open
  assert.throws(() => changeTree(tree, [0], node => { node.status = 'done'; }), /Finish every subtask/);

  // Finish leaf
  const leafDone = changeTree(tree, [0, 0, 0], node => { node.status = 'done'; });
  assert.equal(leafDone[0].status, 'open');
  assert.equal(leafDone[0].done, false);

  // Finish child
  const childDone = changeTree(leafDone, [0, 0], node => { node.status = 'done'; });
  assert.equal(childDone[0].status, 'open');

  // Now parent can be finished
  const allDone = changeTree(childDone, [0], node => { node.status = 'done'; });
  assert.equal(allDone[0].status, 'done');
  assert.equal(allDone[0].done, true);

  // Reopening leaf reopens child and parent
  const reopened = changeTree(allDone, [0, 0, 0], node => { node.status = 'open'; });
  assert.equal(reopened[0].status, 'open');
  assert.equal(reopened[0].children[0].status, 'open');
  assert.equal(reopened[0].children[0].children[0].status, 'open');
});

test('parent can be doing while children are open, but done requires all children done', () => {
  const tree = parseTree([
    '- title: Parent',
    '  status: open',
    '  children:',
    '    - title: Child',
    '      status: open',
  ].join('\n'));

  // Parent status 'doing' is allowed even if child is open
  const doingTree = changeTree(tree, [0], node => { node.status = 'doing'; });
  assert.equal(doingTree[0].status, 'doing');
  assert.equal(doingTree[0].done, false);
});

test('adding a child reopens completed ancestors', () => {
  const tree = parseTree([
    '- title: Parent',
    '  status: done',
    '  children:',
    '    - title: Child',
    '      status: done',
  ].join('\n'));
  const result = changeTree(tree, [0, 0], node => {
    node.children.push({ title: 'New', status: 'open', priority: 'medium', tag: '', collapsed: false, children: [] });
  });
  assert.equal(result[0].status, 'open');
  assert.equal(result[0].children[0].status, 'open');
});

test('deleteNode removes root tasks and nested subtasks safely', () => {
  const input = [
    '- title: Task 1',
    '  status: open',
    '  children:',
    '    - title: Sub 1.1',
    '    - title: Sub 1.2',
    '- title: Task 2',
  ].join('\n');
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

test('removeCompleted removes all done tasks across all levels while preserving open and doing', () => {
  const input = [
    '- title: Root 1',
    '  status: open',
    '  children:',
    '    - title: Sub 1 (done)',
    '      status: done',
    '    - title: Sub 2 (doing)',
    '      status: doing',
    '      children:',
    '        - title: Sub 2.1 (done)',
    '          status: done',
    '        - title: Sub 2.2 (open)',
    '          status: open',
    '- title: Root 2 (done)',
    '  status: done',
    '  children:',
    '    - title: Sub 2.1 (done)',
    '      status: done',
    '- title: Root 3 (empty)',
    '  status: open',
  ].join('\n');

  const tree = parseTree(input);
  assert.equal(statistics(tree).done, 4);
  assert.equal(statistics(tree).total, 8);

  const cleaned = removeCompleted(tree);
  assert.equal(statistics(cleaned).done, 0);
  assert.equal(statistics(cleaned).total, 4);

  assert.equal(cleaned[0].title, 'Root 1');
  assert.equal(cleaned[0].children[0].title, 'Sub 2 (doing)');
  assert.equal(cleaned[0].children[0].status, 'doing');
  assert.equal(cleaned[0].children[0].children[0].title, 'Sub 2.2 (open)');
  assert.equal(cleaned[1].title, 'Root 3 (empty)');
});

test('setBranchesCollapsed updates collapsed state across subtrees', () => {
  const input = [
    '- title: Root',
    '  collapsed: false',
    '  children:',
    '    - title: Sub 1',
    '      collapsed: false',
    '      children:',
    '        - title: Leaf',
  ].join('\n');
  const tree = parseTree(input);
  const collapsed = setBranchesCollapsed(tree, true);
  assert.equal(collapsed[0].collapsed, true);
  assert.equal(collapsed[0].children[0].collapsed, true);

  const expanded = setBranchesCollapsed(collapsed, false);
  assert.equal(expanded[0].collapsed, false);
  assert.equal(expanded[0].children[0].collapsed, false);
});

test('status transitions cycle correctly: open -> doing -> done -> open', () => {
  function cycleStatus(node, blocked = false) {
    const current = node.status || 'open';
    if (current === 'open') {
      node.status = 'doing';
    } else if (current === 'doing') {
      node.status = blocked ? 'open' : 'done';
    } else {
      node.status = 'open';
    }
  }

  const task = { status: 'open' };
  cycleStatus(task);
  assert.equal(task.status, 'doing');
  cycleStatus(task);
  assert.equal(task.status, 'done');
  cycleStatus(task);
  assert.equal(task.status, 'open');

  // Blocked task (incomplete subtasks) cycles doing -> open
  const parent = { status: 'doing' };
  cycleStatus(parent, true);
  assert.equal(parent.status, 'open');
});

test('priority transitions cycle correctly: low -> medium -> high -> low', () => {
  function nextPriority(p) {
    if (p === 'low') return 'medium';
    if (p === 'medium') return 'high';
    return 'low';
  }

  let p = 'low';
  p = nextPriority(p);
  assert.equal(p, 'medium');
  p = nextPriority(p);
  assert.equal(p, 'high');
  p = nextPriority(p);
  assert.equal(p, 'low');
});

test('getAllTags returns all unique sorted non-empty tags from tree', () => {
  const tree = [
    { title: 'A', tag: 'frontend', children: [{ title: 'A1', tag: 'urgent', children: [] }] },
    { title: 'B', tag: 'frontend', children: [{ title: 'B1', tag: '  backend  ', children: [] }] },
    { title: 'C', tag: '', children: [{ title: 'C1', tag: null, children: [] }] },
  ];
  assert.deepEqual(getAllTags(tree), ['backend', 'frontend', 'urgent']);
});

test('filterTree keeps full ancestor context path to matching descendants', () => {
  const tree = [
    {
      title: 'Root 1',
      status: 'open',
      priority: 'low',
      tag: 'misc',
      collapsed: true,
      children: [
        {
          title: 'Sub 1.1',
          status: 'open',
          priority: 'low',
          tag: 'misc',
          collapsed: true,
          children: [
            {
              title: 'Leaf 1.1.1 (TARGET)',
              status: 'doing',
              priority: 'high',
              tag: 'feature',
              collapsed: false,
              children: [
                {
                  title: 'Child of TARGET (should be shown)',
                  status: 'open',
                  priority: 'low',
                  tag: 'other',
                  children: [],
                },
              ],
            },
            {
              title: 'Leaf 1.1.2 (UNRELATED)',
              status: 'open',
              priority: 'low',
              tag: 'docs',
              collapsed: false,
              children: [],
            },
          ],
        },
        {
          title: 'Sub 1.2 (UNRELATED)',
          status: 'open',
          priority: 'low',
          tag: '',
          children: [],
        },
      ],
    },
    {
      title: 'Root 2 (UNRELATED)',
      status: 'done',
      priority: 'low',
      tag: 'misc',
      children: [],
    },
  ];

  // Filter for priority: high
  const filtered = filterTree(tree, { priority: 'high' });
  assert.equal(filtered.length, 1); // Only Root 1 kept
  assert.equal(filtered[0].title, 'Root 1');
  assert.equal(filtered[0].isContextOnly, true);
  assert.equal(filtered[0].collapsed, false); // Ancestor auto-expanded to reveal match
  assert.deepEqual(filtered[0].realPath, [0]);

  assert.equal(filtered[0].children.length, 1); // Only Sub 1.1 kept
  assert.equal(filtered[0].children[0].title, 'Sub 1.1');
  assert.equal(filtered[0].children[0].isContextOnly, true);
  assert.equal(filtered[0].children[0].collapsed, false); // Ancestor auto-expanded
  assert.deepEqual(filtered[0].children[0].realPath, [0, 0]);

  assert.equal(filtered[0].children[0].children.length, 1); // Only target kept
  const target = filtered[0].children[0].children[0];
  assert.equal(target.title, 'Leaf 1.1.1 (TARGET)');
  assert.equal(target.isContextOnly, false);
  assert.deepEqual(target.realPath, [0, 0, 0]);
  assert.equal(target.children.length, 1); // All children of target are included
  assert.equal(target.children[0].title, 'Child of TARGET (should be shown)');
  assert.deepEqual(target.children[0].realPath, [0, 0, 0, 0]);

  // Filter for tag: feature
  const tagFiltered = filterTree(tree, { tag: 'feature' });
  assert.equal(tagFiltered.length, 1);
  assert.equal(tagFiltered[0].children[0].children[0].title, 'Leaf 1.1.1 (TARGET)');

  // Filter for non-matching criteria returns empty
  const noMatch = filterTree(tree, { tag: 'nonexistent' });
  assert.equal(noMatch.length, 0);

  // No active filters returns full tree with realPath attached
  const unfiltered = filterTree(tree, {});
  assert.equal(unfiltered.length, 2);
  assert.deepEqual(unfiltered[0].realPath, [0]);
  assert.deepEqual(unfiltered[1].realPath, [1]);
});
