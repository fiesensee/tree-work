import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseTree, serializeTree } from '../shared/tree.js';

const revisionOf = text => createHash('sha256').update(text).digest('hex');

export function createStore(file) {
  let queue = Promise.resolve();
  async function read() {
    await mkdir(dirname(file), { recursive: true });
    try { await writeFile(file, '', { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const text = await readFile(file, 'utf8');
    return { tree: parseTree(text), revision: revisionOf(text) };
  }
  function save(tree, revision) {
    const operation = queue.then(async () => {
      const text = serializeTree(tree);
      const current = await read();
      if (revision !== current.revision) {
        const error = new Error('The file changed in another tab or editor. Reload the file before trying again.');
        error.status = 409;
        throw error;
      }
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, text, { flag: 'wx' });
        await rename(temporary, file);
      } finally {
        await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
      return { tree: parseTree(text), revision: revisionOf(text) };
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return { read, save };
}
