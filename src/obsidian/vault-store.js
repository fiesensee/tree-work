import { ensureIdentity, parseTree, serializeTree } from '../../shared/tree.js';

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

  // Writes `text` only if the file still holds `expectedRevision`.
  async function write(text, expectedRevision, validateCurrent) {
    pendingText = text;
    try {
      // Vault.process keeps the revision check and write in one atomic operation.
      const saved = await vault.process(file, current => {
        assertActive();
        if (current !== expectedRevision) {
          throw new Error('This file changed in another pane or editor. Reload file before trying again.');
        }
        if (validateCurrent) parseTree(current); // Never replace a malformed source file.
        return text;
      });
      revision = saved;
      return saved;
    } finally {
      pendingText = undefined;
    }
  }

  return {
    async read(attempts = 3) {
      assertActive();
      const text = await vault.read(file);
      assertActive();
      const { tree, changed } = ensureIdentity(parseTree(text));
      revision = text;
      if (!changed) return { tree, revision: text };
      // Older files get ids and timestamps once, written straight back so every
      // reader (including the assistant) sees the same stable ids.
      try {
        const saved = await write(serializeTree(tree), text, true);
        return { tree: parseTree(saved), revision: saved };
      } catch (failure) {
        // Another pane or the sync client wrote first: read its version instead.
        if (attempts > 1 && active) return this.read(attempts - 1);
        throw failure;
      }
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
      const saved = await write(serializeTree(ensureIdentity(tree).tree), expectedRevision, true);
      return { tree: parseTree(saved), revision: saved };
    },
    async saveText(text, expectedRevision) {
      assertActive();
      const saved = await write(text, expectedRevision, false);
      return { text: saved, revision: saved };
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
