import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { changeTree, getNode, statistics } from '../shared/tree.js';
import TreeCanvas from './TreeCanvas.jsx';
import NamedElement from './NamedElement.jsx';

function Icon({ name, size = 18, ...props }) {
  const paths = {
    branch: <><path d="M6 4v16M6 12h12V4"/><circle cx="6" cy="4" r="2"/><circle cx="18" cy="4" r="2"/><circle cx="6" cy="20" r="2"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    chevron: <path d="m9 5 7 7-7 7"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
    back: <path d="M19 12H5m6-6-6 6 6 6"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

function TaskBranch({ node, path, busy, onToggle, onAdd, collapsed, onCollapse, onFocus, isFocusRoot = false }) {
  const pathKey = path.join('.');
  const subtreeId = useId();
  const card = useRef(null);
  useEffect(() => {
    if (isFocusRoot) card.current.focus({ preventScroll: true });
  }, [isFocusRoot, pathKey]);
  const isCollapsed = collapsed.has(pathKey);
  const hasChildren = node.children.length > 0;
  const hiddenCount = isCollapsed ? statistics(node.children).total : 0;
  const childrenDone = node.children.filter(child => child.done).length;
  const blocked = node.children.some(child => !child.done);
  return <li className="branch">
    <article ref={card} tabIndex={isFocusRoot ? -1 : undefined} className={`task-card ${node.done ? 'completed' : ''} ${isFocusRoot ? 'focused-root' : 'can-focus'}`} onClick={event => {
      if (!isFocusRoot && !event.target.closest('button')) onFocus(path);
    }}>
      <div className="task-main">
        <NamedElement className="checkbox" role="checkbox" aria-checked={node.done} label={`${node.done ? 'Reopen' : 'Complete'} ${node.title}${blocked ? '. Finish all subtasks first' : ''}`} disabled={busy || blocked} onClick={() => onToggle(path)}>
          {node.done ? <Icon name="check" size={15}/> : blocked ? <Icon name="lock" size={12}/> : null}
        </NamedElement>
        {isFocusRoot ? <span className="task-title">{node.title}</span> : <NamedElement className="task-title task-focus" label={`Focus on ${node.title}`} onClick={() => onFocus(path)}>{node.title}</NamedElement>}
        {hasChildren && <NamedElement
          className="branch-toggle"
          label={`${isCollapsed ? 'Expand' : 'Collapse'} subtasks of ${node.title}`}
          aria-expanded={!isCollapsed}
          aria-controls={subtreeId}
          onClick={() => onCollapse(pathKey)}
        ><Icon name="chevron" size={16}/></NamedElement>}
      </div>
      <div className="task-bottom">
        <span className={`task-state ${node.done ? 'is-done' : ''}`}>
          {node.done ? 'Completed' : node.children.length ? `${childrenDone}/${node.children.length} subtasks done` : 'Ready to work on'}
          {isCollapsed && <span className="hidden-count">{hiddenCount} hidden {hiddenCount === 1 ? 'task' : 'tasks'}</span>}
        </span>
        <NamedElement className="add-child" disabled={busy} label={`Add subtask to ${node.title}`} onClick={() => onAdd(path)}><Icon name="plus" size={16}/></NamedElement>
      </div>
      {node.children.length > 0 && <div className="node-progress"><span style={{ width: `${childrenDone / node.children.length * 100}%` }}/></div>}
    </article>
    {hasChildren && <ul id={subtreeId} className="children" hidden={isCollapsed}>
      {!isCollapsed && node.children.map((child, index) => <TaskBranch key={index} node={child} path={[...path, index]} busy={busy} onToggle={onToggle} onAdd={onAdd} collapsed={collapsed} onCollapse={onCollapse} onFocus={onFocus}/>)}
    </ul>}
  </li>;
}

function TaskDialog({ parent, onClose, onSubmit, busy, error }) {
  const dialog = useRef(null);
  const titleId = useId();
  const inputId = useId();
  const input = useRef(null);
  const [title, setTitle] = useState('');
  useEffect(() => { dialog.current.showModal(); input.current.focus(); }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); if (title.trim() && !busy) onSubmit(title.trim()); }}>
      <div className="dialog-heading"><span className="eyebrow">{parent ? 'A SMALLER STEP' : 'A NEW BEGINNING'}</span><NamedElement type="button" className="icon-button" label="Close" disabled={busy} onClick={onClose}><Icon name="close"/></NamedElement></div>
      <h2 id={titleId}>{parent ? 'Add a subtask' : 'Plant a new task'}</h2>
      <p>{parent ? <>Under <strong>{parent.title}</strong></> : 'Start with the big picture. Break it down as you go.'}</p>
      <label htmlFor={inputId}>Task name</label>
      <input ref={input} id={inputId} value={title} onChange={event => setTitle(event.target.value)} maxLength={500} placeholder={parent ? 'What’s the next small step?' : 'What would you like to work on?'} required disabled={busy}/>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button" disabled={!title.trim() || busy}>{busy ? 'Saving…' : parent ? 'Add subtask' : 'Add task'}<Icon name="arrow" size={16}/></button></div>
    </form>
  </dialog>;
}

export default function App({ storage, workspaceLabel = 'Local workspace' }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(null);
  const [saved, setSaved] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [focusPath, setFocusPath] = useState(null);
  const working = useRef(false);
  const tree = data?.tree || [];
  const focusKey = focusPath?.join('.') ?? 'main';
  const focusedNode = focusPath ? getNode(tree, focusPath) : null;
  const branchPaths = useMemo(() => {
    const paths = [];
    function visit(nodes, parent = []) {
      nodes.forEach((node, index) => {
        const path = [...parent, index];
        if (node.children.length) {
          paths.push(path.join('.'));
          visit(node.children, path);
        }
      });
    }
    visit(data?.tree || []);
    return paths;
  }, [data?.tree]);
  const visibleBranchPaths = branchPaths.filter(path => !focusPath || path === focusKey || path.startsWith(`${focusKey}.`));

  function focusTask(path) {
    // Reveal the selected task's children while keeping nested fold choices.
    setCollapsed(previous => {
      const next = new Set(previous);
      next.delete(path.join('.'));
      return next;
    });
    setFocusPath(path);
  }

  function setAllBranchesCollapsed(shouldCollapse) {
    setCollapsed(previous => {
      const next = new Set(previous);
      for (const path of visibleBranchPaths) {
        if (shouldCollapse) next.add(path);
        else next.delete(path);
      }
      return next;
    });
  }

  function toggleBranch(pathKey) {
    setCollapsed(previous => {
      const next = new Set(previous);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }

  async function reload() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const value = await storage.read();
      setData(value); setError(''); setSaved(false);
      // File edits can reorder index-based paths; start with every branch open.
      setCollapsed(new Set());
      setFocusPath(null);
      setAdding(null);
    } catch (failure) { setError(failure.message); }
    finally { working.current = false; setBusy(false); }
  }
  useEffect(() => {
    const unsubscribe = storage.subscribe?.(() => {
      setError('This file changed outside this view. Reload file before making more changes.');
      setSaved(false);
    });
    void reload();
    return unsubscribe;
  }, [storage]);

  async function save(nextTree) {
    if (working.current) return false;
    working.current = true; setBusy(true); setError('');
    try {
      const value = await storage.save(nextTree, data.revision);
      setData(value); setSaved(true); return true;
    } catch (failure) { setError(failure.message); return false; }
    finally { working.current = false; setBusy(false); }
  }

  function toggle(path) {
    void save(changeTree(tree, path, node => { node.done = !node.done; }));
  }
  async function add(title) {
    try {
      const node = { title, done: false, children: [] };
      const next = adding.length ? changeTree(tree, adding, parent => { parent.children.push(node); }) : [...tree, node];
      if (await save(next)) {
        // Reveal a newly added child even when its parent was folded.
        setCollapsed(previous => {
          const expanded = new Set(previous);
          expanded.delete(adding.join('.'));
          return expanded;
        });
        setAdding(null);
      }
    } catch (failure) { setError(failure.message); }
  }

  return <NamedElement as="main" className="app" label="Tree Work">
    <TreeCanvas ready={!!data} navigationKey={focusKey} navigationControls={focusedNode && <button className="text-button back-to-root" onClick={() => setFocusPath(null)}><Icon name="back" size={16}/>Back to all tasks</button>} branchControls={<>
      <button className="text-button" disabled={!visibleBranchPaths.length || visibleBranchPaths.every(path => collapsed.has(path))} onClick={() => setAllBranchesCollapsed(true)}>Collapse all</button>
      <button className="text-button" disabled={!visibleBranchPaths.some(path => collapsed.has(path))} onClick={() => setAllBranchesCollapsed(false)}>Expand all</button>
    </>} controls={<>
      <span className="save-status" role="status">{busy ? 'Saving / loading…' : error ? 'File needs attention' : saved ? 'All changes saved' : workspaceLabel}</span>
      <button className="text-button" disabled={busy} onClick={reload}><Icon name="refresh" size={15}/><span>Reload file</span></button>
    </>}>
      {!data ? <div className="loading-state">{error ? 'Your task file could not be opened. Fix the file and try Reload file.' : 'Opening your workspace…'}</div> : (
        <div className="forest">
          {focusedNode ? <ul className="focused-tree">
            <TaskBranch key={focusKey} node={focusedNode} path={focusPath} busy={busy} onToggle={toggle} onAdd={path => { setError(''); setAdding(path); }} collapsed={collapsed} onCollapse={toggleBranch} onFocus={focusTask} isFocusRoot/>
          </ul> : <>
          <div className="forest-origin">
            <Icon name="branch" size={22}/>
            <span>My work</span>
            <NamedElement
              className="add-root"
              disabled={busy}
              label="Add top-level task"
              onClick={() => { setError(''); setAdding([]); }}
            ><Icon name="plus" size={20}/></NamedElement>
          </div>
          {tree.length > 0 && <ul className="children root-branches">
            {tree.map((node, index) => <TaskBranch key={index} node={node} path={[index]} busy={busy} onToggle={toggle} onAdd={path => { setError(''); setAdding(path); }} collapsed={collapsed} onCollapse={toggleBranch} onFocus={focusTask}/>) }
          </ul>}
          </>}
        </div>
      )}
    </TreeCanvas>
    {error && adding === null && <div className="error-banner" role="alert">{error}</div>}
    {adding !== null && <TaskDialog parent={adding.length ? getNode(tree, adding) : null} onClose={() => setAdding(null)} onSubmit={add} busy={busy} error={error}/>}
  </NamedElement>;
}
