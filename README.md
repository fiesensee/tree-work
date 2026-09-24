# Tree Work

A small local React task tracker. Tasks grow left to right in a connected tree, with as many nested subtasks as you need (up to 100 levels). The only runtime dependencies are React and React DOM; Vite handles development and builds, and Node's built-in HTTP server saves the file.

## Run

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The app starts empty and creates `data/tasks.txt` on first load. Each successful change is automatically saved there. There is no database, account, or browser-storage dependency. Keep the Node server running while using the app.

For a production build, run `npm run build` and then `npm start`. The production server uses the same data file. `PORT` overrides the default port. `TREE_WORK_FILE` overrides the file path (relative to the project, or absolute).

## Task file format

```text
- [ ] Launch my project
  - [x] Define the idea
  - [ ] Build the first version
    - [x] Sketch the layout
    - [ ] Build the interface
```

- One task per line; two spaces of indentation per nesting level.
- `- [ ]` means open; `- [x]` means completed. Uppercase `X` is also accepted.
- Titles are plain text, 1–500 characters, with no tabs or line breaks.
- Blank lines are ignored. UTF-8, LF, and CRLF are supported.
- A completed parent must have all its children completed. Parents are completed manually when their subtasks are done.
- Reopening a child or adding an open child automatically reopens completed ancestors.
- Edit the file directly to rename, delete, or reorganize tasks, then click **Reload file**. Invalid files produce an error and are not overwritten.
- Saving uses a temporary file and atomic replacement. Revision checks prevent stale browser tabs from overwriting each other's changes or changes already made in an editor. Avoid editing the file at the exact moment the app is saving (external editors do not share the server's write queue).

`data/example.txt` is an optional sample, not loaded into your task file. Personal tasks are excluded from Git. Back up `data/tasks.txt` as needed.

## Controls

Click the **+** on the **My work** root node to add a top-level task, including when the tree is empty. Use the **+** on any task to add a child. Checkboxes with a lock are waiting for their subtasks. Scroll the canvas horizontally and vertically to explore a large tree. Dialogs support Enter to submit and Escape to cancel.

Use **−** and **+** in the bottom-left corner to zoom the graph. Click the percentage to return to **100%**, or **Fit all** to center the complete tree in the available space. Fit mode follows window resizing and changes to the tree until you adjust the zoom manually. Scrolling still moves around the graph at any zoom level.

Use the chevron on a task with subtasks to collapse or expand its branch. Collapsed tasks show the total number of hidden descendants, and completion still depends on every subtask. **Collapse all** folds every branch, leaving the top-level tasks visible; **Expand all** opens every branch. Nested collapse choices are kept when you toggle an ancestor, and adding a subtask opens its parent. **Fit all** fits the currently visible branches. Collapse state is view-only and resets on page refresh or **Reload file**; it never changes the task file.

Click a task's title or card background to make it the root of the visible tree. Only that task and its descendants are shown, and you can click a deeper task to focus further. **Back to all tasks** returns directly to **My work**. Navigation automatically fits the visible tree. Adding, completing, and reopening tasks still update their original place in the file, including ancestors outside the focused view. Collapse/expand-all applies only to the focused branch. Focus resets on page refresh or **Reload file**.

## Verification

```sh
npm test
npm run build
```

The tests cover parsing, nested completion rules, reopening ancestors, saving/reloading, malformed file preservation, and concurrent-write conflicts.

The server binds to `127.0.0.1` for local use. This prototype is not a multi-user hosted service. Fonts use Google Fonts when available, with local sans-serif fallbacks. The rest of the app works without external services after dependencies are installed.
