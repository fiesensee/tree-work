# Tree Work for Obsidian

An Obsidian plugin for task trees stored in plain-text **`.tree` files**. Opening one in your vault shows the interactive React graph. Each file is an independent tree; edits save directly through Obsidian's Vault API. No local server, database, network connection, or remote fonts are needed by the plugin.

Includes nested subtasks, completion rules, zoom, Fit all, collapsible branches, task focus, and Back to all tasks. The view uses your Obsidian theme's fonts and colors, and its CSS is scoped to Tree Work.

## Install locally

Requires Obsidian **1.6.0 or newer**.

1. Build with `npm install` and `npm run build`, or use the already-built `dist/tree-work` folder.
2. Copy that folder into `<your-vault>/.obsidian/plugins/tree-work/` (use your vault's actual configuration folder if customized).
3. Check that the folder directly contains **`manifest.json`**, **`main.js`**, and **`styles.css`**. Do not nest a second `tree-work` folder inside it.
4. Reload Obsidian, allow community plugins if necessary, and enable **Tree Work** under Settings → Community plugins.

After rebuilding, replace those three files and disable/re-enable the plugin or reload Obsidian. This is a local plugin build, not a published Community Plugins listing. Nothing is installed into your vault automatically.

## Create and open trees

- Run **Tree Work: Create new tree** in the command palette. Enter a name; `.tree` is added automatically. The destination follows Obsidian's new-file folder preference.
- Alternatively, right-click a folder in the file explorer and choose **New task tree** to create one there.
- Click a `.tree` file in the file explorer to open its graph. Duplicate names get a numeric suffix rather than overwriting existing files.
- A blank `.tree` file is a valid empty tree. The **+** on **My work** creates the first top-level task.

Tree Work registers the `tree` extension with its custom file view using Obsidian's public [plugin API](https://github.com/obsidianmd/obsidian-api). Markdown files and other extensions keep their existing behavior.

## Bring over the existing tasks

Copy `data/tasks.txt` into your vault and name the copy something like **My work.tree**. The format is unchanged, so no conversion is needed. Keep the original as a backup. The optional `examples/Example.tree` is also ready to copy into a vault.

Your personal data is not included in the plugin bundle or sample file.

## File format

```text
- [ ] Launch my project
  - [x] Define the idea
  - [ ] Build the first version
    - [x] Sketch the layout
    - [ ] Build the interface
```

- One task per line; **two spaces per nesting level**.
- `- [ ]` means open; `- [x]` means completed. Uppercase `X` is accepted.
- Titles are plain text, 1–500 characters, without tabs or line breaks.
- UTF-8, LF, CRLF, a UTF-8 BOM, and blank lines are supported.
- Up to 10,000 tasks and 100 nesting levels.
- Parents can be completed manually only after every child is complete.
- Reopening a task or adding an unfinished child reopens all completed ancestors, even outside the focused view.

Rename, delete, and reorganize tasks by editing the text file externally, then click **Reload file** in the graph. This version does not include a raw-text editor inside Obsidian. Invalid files display an error and are never silently replaced with an empty tree.

## Graph controls

- **+** on My work adds a top-level task; **+** on a task adds a child.
- Checkboxes complete/reopen tasks. A lock means unfinished subtasks remain.
- **− / +** zoom the graph. The percentage resets to **100%**. **Fit all** fits the visible branches and follows changes in the pane size or tree.
- Chevrons collapse/expand branches; folded tasks show their hidden descendant count. **Collapse all / Expand all** operate on the current view.
- Click a title or card background to make that task the visible root. **Back to all tasks** restores My work. Focus changes fit the visible tree automatically.
- Task dialogs support Enter to submit and Escape to cancel.

Focus and collapse are temporary view state. They reset when the file is reopened or reloaded and are never written to the task file. Different panes have independent view state.

## Saving and external changes

Changes save immediately via `Vault.process`, with the source text checked inside the atomic update. If a file has changed in another pane or editor, saving is rejected until you reload. Other open Tree Work panes display a reload notice when the file changes. The reload also closes any add-task dialog because file edits may have changed task paths.

Each view's storage is bound to its own vault file. Renaming a file does not redirect edits elsewhere, and closing a view unregisters its listeners and React root. Normal vault operations handle file rename/delete and synchronization; Tree Work does not manage sync itself.

## Development and verification

Use Node.js 22.12+ (Node 24 recommended).

```sh
npm install
npm run build       # type-check + production Obsidian bundle
npm run dev         # watch plugin JS/CSS; reload plugin after copying outputs
npm test           # parser, task rules, vault storage, and file creation
node scripts/check-plugin.mjs  # checks the built package and registration contract
```

Build output is `dist/tree-work/{main.js,manifest.json,styles.css}`. React is bundled; Obsidian is an external runtime dependency provided by the app. The manifest permits desktop and mobile because the plugin uses public vault and DOM APIs, not Node filesystem APIs.

Automated verification uses unit tests, API type-checking, and package checks only. **The plugin has not been run inside Obsidian or verified with computer automation.** Desktop/mobile layout, pop-out windows, and theme appearance still need your manual check.

Suggested manual checks:

1. Enable the plugin and create/open an empty `.tree` file.
2. Add a parent and child; verify the parent stays locked until the child is done.
3. Close/reopen the file and confirm the task changes remain.
4. Try zoom, Fit all, folding, focus, and Back to all tasks in a narrow pane.
5. Open the same tree in two panes, save in one, and reload the other when notified.
6. Edit or rename the file externally, then reload; verify malformed text produces an error without overwriting it.

## Optional standalone web app

The original web runner remains available for development, with the same React graph:

```sh
npm run web:dev
npm run web:build
npm run web:start
```

It opens at `http://127.0.0.1:5173` and uses `data/tasks.txt`. `PORT` and `TREE_WORK_FILE` still override those defaults. Its build goes to `dist/web`, separate from the plugin. The Obsidian plugin never starts or contacts this server.
