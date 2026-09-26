import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FileView, Modal, Notice, Plugin, Setting, TFolder, setIcon, setTooltip, type TFile, type WorkspaceLeaf, type App as ObsidianApp } from 'obsidian';
import TreeApp from '../App.jsx';
import { createVaultStore } from './vault-store.js';
import { createTreeFile } from './create-tree.js';
import '../style.css';

const VIEW_TYPE = 'tree-work';
let nextViewId = 0;

interface TextApi {
  switchToTree: () => Promise<boolean>;
}

interface AppApi {
  cleanUp: () => void;
  getCompletedCount: () => number;
}

class TreeWorkView extends FileView {
  private root: Root | null = null;
  private store: ReturnType<typeof createVaultStore> | null = null;
  private plugin: TreeWorkPlugin;
  private mode: 'tree' | 'text' = 'tree';
  private switchActionBtn: HTMLElement | null = null;
  private textApi: TextApi | null = null;
  private appApi: AppApi | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: TreeWorkPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.file?.basename ?? 'Tree Work'; }
  getIcon() { return 'git-branch'; }
  canAcceptExtension(extension: string) { return extension.toLowerCase() === 'tree'; }

  onload() {
    super.onload?.();
    this.switchActionBtn = this.addAction('file-text', 'Switch to text view', () => {
      void this.toggleViewMode();
    });
  }

  async onLoadFile(file: TFile) {
    this.release();
    this.mode = 'tree';
    this.updateActionBtn();
    this.contentEl.addClass('tree-work-view');
    const container = this.contentEl.createDiv({ cls: 'tree-work-root' });
    this.store = createVaultStore(this.app.vault, file);
    this.root = createRoot(container, { identifierPrefix: `tree-work-${++nextViewId}-` });
    this.renderApp();
    this.plugin.views.add(this);
  }

  private renderApp() {
    if (!this.root || !this.store) return;
    this.root.render(
      <TreeApp
        storage={this.store}
        mode={this.mode}
        onModeChange={(nextMode: 'tree' | 'text') => {
          this.setMode(nextMode);
        }}
        onRegisterTextApi={(api: TextApi | null) => {
          this.textApi = api;
        }}
        onRegisterAppApi={(api: AppApi | null) => {
          this.appApi = api;
        }}
      />
    );
  }

  public updateActionBtn() {
    if (!this.switchActionBtn) return;
    const isTree = this.mode === 'tree';
    const nextIcon = isTree ? 'file-text' : 'git-branch';
    const nextTitle = isTree ? 'Switch to text view' : 'Switch to tree view';
    setIcon(this.switchActionBtn, nextIcon);
    setTooltip(this.switchActionBtn, nextTitle);
    this.switchActionBtn.setAttribute('aria-label', nextTitle);
  }

  public setMode(mode: 'tree' | 'text') {
    if (this.mode === mode) return;
    this.mode = mode;
    this.updateActionBtn();
    this.renderApp();
  }

  public async toggleViewMode(): Promise<boolean> {
    if (this.mode === 'text' && this.textApi) {
      return await this.textApi.switchToTree();
    }
    this.setMode(this.mode === 'tree' ? 'text' : 'tree');
    return true;
  }

  public requestCleanUp() {
    if (this.mode === 'text') {
      new Notice('Switch to tree view to clean up completed tasks.');
      return;
    }
    if (this.appApi) {
      if (this.appApi.getCompletedCount() === 0) {
        new Notice('No completed tasks to clean up.');
        return;
      }
      this.appApi.cleanUp();
    }
  }

  async onUnloadFile(_file: TFile) { this.release(); }
  async onClose() { this.release(); }

  release() {
    this.root?.unmount();
    this.root = null;
    this.store?.dispose();
    this.store = null;
    this.textApi = null;
    this.appApi = null;
    this.contentEl.empty();
    this.plugin.views.delete(this);
  }
}

class NewTreeModal extends Modal {
  private creating = false;
  constructor(app: ObsidianApp, private folderPath: string) { super(app); }

  onOpen() {
    this.titleEl.setText('New task tree');
    let title = 'Untitled';
    let input: HTMLInputElement;
    let createButton: HTMLButtonElement;
    const error = this.contentEl.createDiv({ attr: { role: 'alert' } });
    const submit = async () => {
      if (this.creating) return;
      this.creating = true;
      createButton.disabled = true;
      error.setText('');
      try {
        const file = await createTreeFile(this.app.vault, this.folderPath, title);
        this.close();
        await this.app.workspace.getLeaf('tab').openFile(file);
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : String(failure);
        error.setText(message);
        new Notice(`Could not create or open tree: ${message}`);
      } finally {
        this.creating = false;
        createButton.disabled = false;
      }
    };
    new Setting(this.contentEl).setName('File name').setDesc('Saved as a .tree file in the selected folder.').addText(text => {
      input = text.inputEl;
      text.setValue(title).onChange(value => { title = value; });
      text.inputEl.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); void submit(); }
      });
    });
    new Setting(this.contentEl).addButton(button => {
      createButton = button.buttonEl;
      button.setButtonText('Create tree').setCta().onClick(() => { void submit(); });
    });
    input!.focus();
    input!.select();
  }

  onClose() { this.contentEl.empty(); }
}

export default class TreeWorkPlugin extends Plugin {
  views = new Set<TreeWorkView>();

  onload() {
    this.registerView(VIEW_TYPE, leaf => new TreeWorkView(leaf, this));
    this.registerExtensions(['tree'], VIEW_TYPE);
    this.addCommand({
      id: 'create-tree',
      name: 'Create new tree',
      callback: () => {
        const source = this.app.workspace.getActiveFile()?.path ?? '';
        const folder = this.app.fileManager.getNewFileParent(source);
        new NewTreeModal(this.app, folder.path).open();
      },
    });
    this.addCommand({
      id: 'toggle-tree-text-view',
      name: 'Switch between tree and text view',
      checkCallback: (checking: boolean) => {
        const activeView = this.app.workspace.getActiveViewOfType(TreeWorkView);
        if (activeView) {
          if (!checking) {
            void activeView.toggleViewMode();
          }
          return true;
        }
        return false;
      },
    });
    this.addCommand({
      id: 'clean-up-completed',
      name: 'Clean up completed tasks',
      checkCallback: (checking: boolean) => {
        const activeView = this.app.workspace.getActiveViewOfType(TreeWorkView);
        if (activeView) {
          if (!checking) {
            activeView.requestCleanUp();
          }
          return true;
        }
        return false;
      },
    });
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFolder) {
        menu.addItem(item => item.setTitle('New task tree').setIcon('git-branch').onClick(() => {
          new NewTreeModal(this.app, file.path).open();
        }));
      }
    }));
  }

  onunload() {
    // Release React roots and vault event listeners without closing user tabs.
    for (const view of [...this.views]) view.release();
  }
}
