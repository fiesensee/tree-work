import { parse, stringify } from 'yaml';

// The file format is YAML representing a tree of tasks.
export function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export const VALID_STATUSES = ['open', 'doing', 'done'];
export const VALID_PRIORITIES = ['low', 'medium', 'high'];

export function validateTree(tree) {
  let count = 0;
  function visit(nodes, depth = 0) {
    if (!Array.isArray(nodes)) throw new Error('Tasks must be a list.');
    if (depth > 100) throw new Error('Please keep tasks within 100 levels.');
    for (const node of nodes) {
      if (++count > 10000) throw new Error('The file can contain at most 10,000 tasks.');
      if (!node || typeof node !== 'object') {
        throw new Error('Each task must be an object.');
      }
      if (typeof node.title !== 'string' || !node.title.trim() || /[\r\n\u0000-\u001f]/.test(node.title) || node.title.length > 500) {
        throw new Error('Each task needs a single-line title of 1–500 characters.');
      }
      if (node.done !== undefined && (node.status === undefined || (node.done && node.status !== 'done') || (!node.done && node.status === 'done'))) {
        node.status = node.done ? 'done' : 'open';
      } else if (!node.status) {
        node.status = 'open';
      }
      if (!node.priority) node.priority = 'low';
      if (node.tag === undefined || node.tag === null) node.tag = '';
      if (node.collapsed === undefined) node.collapsed = false;
      if (!node.children) node.children = [];

      if (!VALID_STATUSES.includes(node.status)) {
        throw new Error(`Task status must be open, doing, or done (got "${node.status}").`);
      }
      if (!VALID_PRIORITIES.includes(node.priority)) {
        throw new Error(`Task priority must be low, medium, or high (got "${node.priority}").`);
      }
      if (typeof node.tag !== 'string') {
        throw new Error('Task tag must be a string.');
      }
      if (typeof node.collapsed !== 'boolean') {
        throw new Error('Task collapsed must be true or false.');
      }
      if (!Array.isArray(node.children)) {
        throw new Error('Task children must be a list.');
      }
      node.done = node.status === 'done';
      visit(node.children, depth + 1);
      if (node.status === 'done' && node.children.some(child => child.status !== 'done')) {
        throw new Error('Finish every subtask before completing its parent.');
      }
    }
  }
  visit(tree);
  return tree;
}

function normalizeNode(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Each task in YAML must be an object.');
  }
  const title = typeof raw.title === 'string' ? raw.title.trim() : (raw.title !== undefined && raw.title !== null ? String(raw.title).trim() : '');
  
  let status = 'open';
  if (VALID_STATUSES.includes(raw.status)) {
    status = raw.status;
  } else if (raw.done === true) {
    status = 'done';
  } else if (raw.status !== undefined) {
    throw new Error(`Task status must be open, doing, or done (got "${raw.status}").`);
  }

  let priority = 'low';
  if (VALID_PRIORITIES.includes(raw.priority)) {
    priority = raw.priority;
  } else if (raw.priority !== undefined) {
    throw new Error(`Task priority must be low, medium, or high (got "${raw.priority}").`);
  }

  const tag = raw.tag !== undefined && raw.tag !== null ? String(raw.tag).trim() : '';
  const collapsed = Boolean(raw.collapsed);
  const children = Array.isArray(raw.children) ? raw.children.map(normalizeNode) : [];

  return {
    title,
    status,
    priority,
    tag,
    collapsed,
    done: status === 'done',
    children,
  };
}

function parseLegacyChecklist(text) {
  const roots = [];
  const stack = [];
  for (const [index, line] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const match = /^( *)- \[([ xX])\] (.+)$/.exec(line);
    if (!match || match[1].length % 2 || /[\u0000-\u001f]/.test(line)) {
      throw new Error(`Line ${index + 1}: use two-space indents and "- [ ] Task".`);
    }
    const depth = match[1].length / 2;
    if (depth > stack.length) throw new Error(`Line ${index + 1}: a task is missing its parent.`);
    const isDone = match[2].toLowerCase() === 'x';
    const node = {
      title: match[3].trim(),
      status: isDone ? 'done' : 'open',
      priority: 'low',
      tag: '',
      collapsed: false,
      done: isDone,
      children: [],
    };
    (depth === 0 ? roots : stack[depth - 1].children).push(node);
    stack[depth] = node;
    stack.length = depth + 1;
  }
  return roots;
}

export function parseTree(text) {
  if (typeof text !== 'string') throw new Error('Input must be a string.');
  const cleaned = text.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];

  // Check if legacy markdown checklist
  const firstNonEmpty = cleaned.split(/\r?\n/).find(line => line.trim());
  if (firstNonEmpty && /^ *- \[([ xX])\]/.test(firstNonEmpty)) {
    return validateTree(parseLegacyChecklist(cleaned));
  }

  let parsed;
  try {
    parsed = parse(cleaned);
  } catch (err) {
    throw new Error(`YAML syntax error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (parsed === null || parsed === undefined) return [];
  if (!Array.isArray(parsed)) throw new Error('Tasks must be a list.');

  const roots = parsed.map(normalizeNode);
  return validateTree(roots);
}

export function serializeTree(tree) {
  validateTree(tree);
  if (!tree || tree.length === 0) return '';
  function formatNode(node) {
    const item = {
      title: node.title.trim(),
      status: node.status || (node.done ? 'done' : 'open'),
      priority: node.priority || 'low',
      tag: typeof node.tag === 'string' ? node.tag.trim() : '',
      collapsed: Boolean(node.collapsed),
    };
    if (node.children && node.children.length > 0) {
      item.children = node.children.map(formatNode);
    }
    return item;
  }
  return stringify(tree.map(formatNode), { indent: 2 });
}

export function getNode(tree, path) {
  return path.reduce((nodes, index, depth) => depth === path.length - 1 ? nodes[index] : nodes[index].children, tree);
}

export function changeTree(tree, path, change) {
  const copy = structuredClone(tree);
  const target = getNode(copy, path);
  const prevStatus = target.status;
  const prevDone = target.done !== undefined ? target.done : (target.status === 'done');
  const wasDone = prevStatus === 'done' || prevDone === true;
  change(target);
  // Synchronize status and done
  if (target.status !== prevStatus) {
    target.done = target.status === 'done';
  } else if (target.done !== prevDone) {
    target.status = target.done ? 'done' : 'open';
  } else {
    target.done = target.status === 'done';
  }
  if (!wasDone && target.status === 'done' && target.children.some(child => child.status !== 'done')) {
    throw new Error('Finish every subtask before completing its parent.');
  }
  // Reopening or adding a child reopens every completed ancestor.
  for (let length = path.length; length > 0; length--) {
    const node = getNode(copy, path.slice(0, length));
    if (node.children.some(child => child.status !== 'done')) {
      if (node.status === 'done') {
        node.status = 'open';
        node.done = false;
      }
    }
  }
  return validateTree(copy);
}

export function setBranchesCollapsed(tree, shouldCollapse, focusPath = null) {
  const copy = structuredClone(tree);
  const targetSubtree = focusPath && focusPath.length > 0 ? [getNode(copy, focusPath)] : copy;
  function walk(nodes) {
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        node.collapsed = shouldCollapse;
        walk(node.children);
      }
    }
  }
  walk(targetSubtree);
  return validateTree(copy);
}

export function statistics(nodes) {
  return nodes.reduce((result, node) => {
    const children = statistics(node.children);
    return {
      total: result.total + children.total + 1,
      done: result.done + children.done + Number(node.status === 'done'),
    };
  }, { total: 0, done: 0 });
}

export function deleteNode(tree, path) {
  if (!path || !path.length) throw new Error('A path is required to delete a task.');
  const copy = structuredClone(tree);
  if (path.length === 1) {
    const index = path[0];
    if (index < 0 || index >= copy.length) throw new Error('Task does not exist.');
    copy.splice(index, 1);
  } else {
    const parentPath = path.slice(0, -1);
    const index = path[path.length - 1];
    const parent = getNode(copy, parentPath);
    if (!parent || !parent.children || index < 0 || index >= parent.children.length) {
      throw new Error('Task does not exist.');
    }
    parent.children.splice(index, 1);
  }
  return validateTree(copy);
}

export function removeCompleted(tree) {
  function prune(nodes) {
    const kept = [];
    for (const node of nodes) {
      if (node.status !== 'done') {
        kept.push({
          ...node,
          children: prune(node.children),
        });
      }
    }
    return kept;
  }
  return validateTree(prune(tree));
}

export function getAllTags(tree) {
  const tags = new Set();
  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (typeof node?.tag === 'string') {
        const trimmed = node.tag.trim();
        if (trimmed) tags.add(trimmed);
      }
      if (node?.children) walk(node.children);
    }
  }
  walk(tree);
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

export function filterTree(tree, filters = {}, baseParentPath = []) {
  const { status = null, priority = null, tag = null } = filters;
  const isFiltered = Boolean(status || priority || tag);

  function matches(node) {
    if (!isFiltered) return true;
    if (status && (node.status || 'open') !== status) return false;
    if (priority && (node.priority || 'low') !== priority) return false;
    if (tag && (node.tag || '') !== tag) return false;
    return true;
  }

  function walk(nodes, parentPath, ancestorMatched = false) {
    if (!Array.isArray(nodes)) return [];
    const result = [];
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      const realPath = [...parentPath, index];
      const selfMatches = matches(node);
      const isSubtreeMatched = ancestorMatched || selfMatches;
      const filteredChildren = walk(node.children || [], realPath, isSubtreeMatched);
      const hasMatchingDescendant = !ancestorMatched && filteredChildren.length > 0;

      if (!isFiltered) {
        result.push({
          ...node,
          realPath,
          children: filteredChildren,
        });
      } else if (ancestorMatched) {
        // Child item of a filter result: always included
        result.push({
          ...node,
          realPath,
          isContextOnly: false,
          children: filteredChildren,
        });
      } else if (selfMatches || hasMatchingDescendant) {
        result.push({
          ...node,
          realPath,
          // Expand ancestor if it has matching descendants so the matching subtasks are visible
          collapsed: hasMatchingDescendant ? false : node.collapsed,
          isContextOnly: !selfMatches && hasMatchingDescendant,
          children: filteredChildren,
        });
      }
    }
    return result;
  }

  return walk(tree, baseParentPath, false);
}

