import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const directory = new URL('../dist/tree-work/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
assert.equal(manifest.id, 'tree-work');
assert.equal(manifest.version, JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version);
assert.deepEqual((await readdir(directory)).sort(), ['main.js', 'manifest.json', 'styles.css']);
const code = await readFile(new URL('main.js', directory), 'utf8');
const css = await readFile(new URL('styles.css', directory), 'utf8');
assert.ok(!code.includes('/api/tasks'), 'Plugin must not contact the standalone server');
assert.ok(!code.includes("createElement('script')") && !code.includes('createElement("script")'), 'Plugin must not create script elements at runtime');
assert.ok(!code.includes('<script>'), 'Plugin must not inject script tags via HTML');
assert.ok(!css.includes('fonts.googleapis.com'), 'Plugin must work without remote fonts');
assert.ok(!css.includes('100dvh'), 'Plugin must fit its pane, not the whole window');
assert.ok(css.includes('.tree-work-root'), 'Plugin styles must be scoped');

// Load the actual CommonJS release with a minimal API double, without any UI.
const registrations = { commands: [] };
class Plugin {
  app = { workspace: { on: (event, callback) => ({ event, callback }), getActiveViewOfType: () => null } };
  registerView(type, factory) { registrations.view = { type, factory }; }
  registerExtensions(extensions, type) { registrations.extensions = { extensions, type }; }
  addCommand(command) { registrations.commands.push(command); }
  registerEvent(event) { registrations.event = event; }
}
class FileView {
  constructor(leaf) { this.leaf = leaf; }
  onload() {}
  addAction(icon, title, callback) {
    return { icon, title, callback, setAttribute() {} };
  }
}
const api = {
  Plugin,
  FileView,
  Modal: class {},
  TFolder: class {},
  Notice: class {},
  Setting: class {},
  setIcon: () => {},
  setTooltip: () => {},
};
const module = { exports: {} };
runInNewContext(code, {
  module, exports: module.exports,
  require(name) { assert.equal(name, 'obsidian', 'Only Obsidian may be required at runtime'); return api; },
  console, setTimeout, clearTimeout, TextEncoder, TextDecoder,
});
const plugin = new module.exports.default();
plugin.onload();
assert.equal(registrations.view.type, 'tree-work');
assert.equal(JSON.stringify(registrations.extensions), JSON.stringify({ extensions: ['tree'], type: 'tree-work' }));
assert.ok(registrations.commands.some(c => c.id === 'create-tree'), 'create-tree command must be registered');
assert.ok(registrations.commands.some(c => c.id === 'toggle-tree-text-view'), 'toggle-tree-text-view command must be registered');
assert.ok(registrations.commands.some(c => c.id === 'clean-up-completed'), 'clean-up-completed command must be registered');
assert.equal(registrations.event.event, 'file-menu');
const view = registrations.view.factory({});
view.onload();
assert.equal(view.getViewType(), 'tree-work');
assert.equal(view.canAcceptExtension('tree'), true);
assert.equal(view.canAcceptExtension('md'), false);
plugin.onunload();
console.log('Plugin package passed: CommonJS load, .tree registration, command, file view, no server dependency, and offline styles.');
