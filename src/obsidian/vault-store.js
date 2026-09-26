import { parseTree, serializeTree } from '../../shared/tree.js';

// A store is bound to one TFile, never to whichever file is currently active.
// Full source text is the revision token, so no Node or crypto API is needed.
export function createVaultStore(vault, file) {
  let active = true;
  let revision;
  let pendingText;
  const listeners = new Set();

  function assertActive() {
    if (!active) throw new Error('This tree view has been closed. Reopen the file to continue.');
  }

  const changed = vault.on('modify', changedFile => {
    if (changedFile !== file || !active) return;
    void vault.read(file).then(text => {
      if (active && text !== revision && text !== pendingText) {
        for (const listener of listeners) listener();
      }
    }).catch(() => {
      if (active) for (const listener of listeners) listener();
    });
  });

  return {
    async read() {
      assertActive();
      const text = await vault.read(file);
      assertActive();
      const tree = parseTree(text);
      revision = text;
      return { tree, revision: text };
    },
    async readText() {
      assertActive();
      const text = await vault.read(file);
      assertActive();
      revision = text;
      return { text, revision: text };
    },
    async save(tree, expectedRevision) {
      assertActive();
      const text = serializeTree(tree);
      pendingText = text;
      try {
        // Vault.process keeps the revision check and write in one atomic operation.
        const saved = await vault.process(file, current => {
          assertActive();
          if (current !== expectedRevision) {
            throw new Error('This file changed in another pane or editor. Reload file before trying again.');
          }
          parseTree(current); // Never replace a malformed source file.
          return text;
        });
        revision = saved;
        return { tree: parseTree(saved), revision: saved };
      } finally {
        pendingText = undefined;
      }
    },
    async saveText(text, expectedRevision) {
      assertActive();
      pendingText = text;
      try {
        const saved = await vault.process(file, current => {
          assertActive();
          if (current !== expectedRevision) {
            throw new Error('This file changed in another pane or editor. Reload file before trying again.');
          }
          return text;
        });
        revision = saved;
        return { text: saved, revision: saved };
      } finally {
        pendingText = undefined;
      }
    },
    subscribe(listener) {
      assertActive();
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      active = false;
      listeners.clear();
      vault.offref(changed);
    },
  };
}
