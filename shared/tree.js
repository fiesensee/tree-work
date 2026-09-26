// The file format is an indented checklist, with two spaces per level.
export function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function validateTree(tree) {
  let count = 0;
  function visit(nodes, depth = 0) {
    if (!Array.isArray(nodes)) throw new Error('Tasks must be a list.');
    if (depth > 100) throw new Error('Please keep tasks within 100 levels.');
    for (const node of nodes) {
      if (++count > 10000) throw new Error('The file can contain at most 10,000 tasks.');
      if (!node || typeof node.title !== 'string' || !node.title.trim() || /[\r\n\u0000-\u001f]/.test(node.title) || node.title.length > 500) {
        throw new Error('Each task needs a single-line title of 1–500 characters.');
      }
      if (typeof node.done !== 'boolean') throw new Error('Task completion must be true or false.');
      visit(node.children, depth + 1);
      if (node.done && node.children.some(child => !child.done)) {
        throw new Error('Finish every subtask before completing its parent.');
      }
    }
  }
  visit(tree);
  return tree;
}

export function parseTree(text) {
  const roots = [];
  const stack = [];
  for (const [index, line] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const match = /^( *)- \[([ xX])\] (.+)$/.exec(line);
    if (!match || match[1].length % 2 || /[\u0000-\u001f]/.test(line)) throw new Error(`Line ${index + 1}: use two-space indents and "- [ ] Task".`);
    const depth = match[1].length / 2;
    if (depth > stack.length) throw new Error(`Line ${index + 1}: a task is missing its parent.`);
    const node = { title: match[3].trim(), done: match[2].toLowerCase() === 'x', children: [] };
    (depth === 0 ? roots : stack[depth - 1].children).push(node);
    stack[depth] = node;
    stack.length = depth + 1;
  }
  return validateTree(roots);
}

export function serializeTree(tree) {
  validateTree(tree);
  const lines = [];
  function visit(nodes, depth) {
    for (const node of nodes) {
      lines.push(`${'  '.repeat(depth)}- [${node.done ? 'x' : ' '}] ${node.title.trim()}`);
      visit(node.children, depth + 1);
    }
  }
  visit(tree, 0);
  return lines.length ? `${lines.join('\n')}\n` : '';
}

export function getNode(tree, path) {
  return path.reduce((nodes, index, depth) => depth === path.length - 1 ? nodes[index] : nodes[index].children, tree);
}

export function changeTree(tree, path, change) {
  const copy = structuredClone(tree);
  const target = getNode(copy, path);
  const wasDone = target.done;
  change(target);
  if (!wasDone && target.done && target.children.some(child => !child.done)) {
    throw new Error('Finish every subtask before completing its parent.');
  }
  // Reopening or adding a child reopens every completed ancestor.
  for (let length = path.length; length > 0; length--) {
    const node = getNode(copy, path.slice(0, length));
    if (node.children.some(child => !child.done)) node.done = false;
  }
  return validateTree(copy);
}

export function statistics(nodes) {
  return nodes.reduce((result, node) => {
    const children = statistics(node.children);
    return { total: result.total + children.total + 1, done: result.done + children.done + Number(node.done) };
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
      if (!node.done) {
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
