import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { changeTree, deleteNode, getErrorMessage, getNode, removeCompleted, statistics, setBranchesCollapsed, getAllTags, filterTree } from '../shared/tree.js';
import TreeCanvas from './TreeCanvas.jsx';
import NamedElement from './NamedElement.jsx';
import TextView from './TextView.jsx';

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
    fileText: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
    trash: <><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>,
    broom: <><path d="m15 4-3 3M18.5 7.5 15 4l-9 9 3.5 3.5 9-9z"/><path d="m9.5 16.5-6 6M6 22l-3-3 4-4"/></>,
    pencil: <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></>,
    tag: <><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><circle cx="7" cy="7" r="1.5"/></>,
    circleDot: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/></>,
    minus: <path d="M5 12h14"/>,
    folder: <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>,
    folderOpen: <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/>,
    filter: <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>,
    chevronUp: <path d="m18 15-6-6-6 6"/>,
    chevronsUp2: <><path d="m18 11-6-6-6 6"/><path d="m18 17-6-6-6 6"/></>,
    chevronsUp3: <><path d="m18 8-6-6-6 6"/><path d="m18 13-6-6-6 6"/><path d="m18 18-6-6-6 6"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

function nextPriority(priority) {
  if (priority === 'low') return 'medium';
  if (priority === 'medium') return 'high';
  return 'low';
}

function PriorityIcon({ priority, size = 15 }) {
  if (priority === 'high') return <Icon name="chevronsUp3" size={size}/>;
  if (priority === 'medium') return <Icon name="chevronsUp2" size={size}/>;
  return <Icon name="chevronUp" size={size}/>;
}

function adjustPathAfterDelete(targetPath, deletedPath) {
  if (!targetPath) return null;
  const minLen = Math.min(targetPath.length, deletedPath.length);
  for (let i = 0; i < minLen; i++) {
    if (targetPath[i] < deletedPath[i]) {
      return targetPath;
    }
    if (targetPath[i] > deletedPath[i]) {
      if (i === deletedPath.length - 1) {
        const next = [...targetPath];
        next[i] -= 1;
        return next;
      }
      return targetPath;
    }
  }
  if (targetPath.length >= deletedPath.length) {
    return null;
  }
  return targetPath;
}

function TaskBranch({
  node,
  path,
  busy,
  onToggle,
  onCyclePriority,
  onAdd,
  onEdit,
  onDelete,
  onCollapse,
  onFocus,
  isFocusRoot = false,
}) {
  const subtreeId = useId();
  const card = useRef(null);
  const currentPath = node.realPath || path;
  useEffect(() => {
    if (isFocusRoot) card.current?.focus({ preventScroll: true });
  }, [isFocusRoot, currentPath.join('.')]);

  const isCollapsed = Boolean(node.collapsed);
  const isContextOnly = Boolean(node.isContextOnly);
  const hasChildren = node.children.length > 0;
  const hiddenCount = isCollapsed ? statistics(node.children).total : 0;
  const isDone = node.status === 'done';
  const isDoing = node.status === 'doing';
  const childrenDone = node.children.filter(child => child.status === 'done' || child.done).length;
  const blocked = node.children.some(child => child.status !== 'done' && !child.done);

  return <li className="branch">
    <article
      ref={card}
      tabIndex={isFocusRoot ? -1 : undefined}
      className={`task-card priority-${node.priority || 'low'} ${isDone ? 'completed' : ''} ${isDoing ? 'in-progress' : ''} ${isContextOnly ? 'context-only' : ''} ${isFocusRoot ? 'focused-root' : 'can-focus'}`}
      onClick={event => {
        if (!isFocusRoot && !event.target.closest('button')) onFocus(currentPath);
      }}
    >
      <div className="task-main">
        <NamedElement
          className={`checkbox ${isDoing ? 'is-doing' : ''}`}
          role="checkbox"
          aria-checked={isDone}
          label={
            isDone
              ? `Reopen ${node.title} (set to open)`
              : isDoing
                ? (blocked ? `Set ${node.title} to open (subtasks incomplete)` : `Complete ${node.title} (set to done)`)
                : `Start ${node.title} (set to doing)`
          }
          disabled={busy}
          onClick={() => onToggle(currentPath)}
        >
          {isDone ? <Icon name="check" size={15}/> : isDoing ? <Icon name="circleDot" size={13}/> : null}
        </NamedElement>
        {isFocusRoot ? (
          <span className="task-title">{node.title}</span>
        ) : (
          <NamedElement className="task-title task-focus" label={`Focus on ${node.title}`} onClick={() => onFocus(currentPath)}>
            {node.title}
          </NamedElement>
        )}
        <div className="task-main-actions">
          <NamedElement
            className={`priority-toggle priority-${node.priority || 'low'}`}
            disabled={busy}
            label={`Priority: ${node.priority || 'low'}. Click to cycle priority`}
            onClick={event => { event.stopPropagation(); onCyclePriority(currentPath); }}
          >
            <PriorityIcon priority={node.priority || 'low'} size={15}/>
          </NamedElement>
          {hasChildren && <NamedElement
            className="branch-toggle"
            label={`${isCollapsed ? 'Expand' : 'Collapse'} subtasks of ${node.title}`}
            aria-expanded={!isCollapsed}
            aria-controls={subtreeId}
            onClick={event => { event.stopPropagation(); onCollapse(currentPath); }}
          ><Icon name={isCollapsed ? 'folder' : 'folderOpen'} size={15}/></NamedElement>}
        </div>
      </div>

      {(isContextOnly || Boolean(node.tag)) && (
        <div className="task-meta">
          {isContextOnly && (
            <span className="task-badge task-context-pill" title="Shown for hierarchy context (subtask matches filter)">
              Context
            </span>
          )}
          {Boolean(node.tag) && (
            <span
              className="task-badge task-tag-pill"
              title={`Tag: ${node.tag}. Click to edit task`}
              onClick={event => { event.stopPropagation(); onEdit(currentPath, node); }}
            >
              <Icon name="tag" size={11}/>
              <span>{node.tag}</span>
            </span>
          )}
        </div>
      )}

      <div className="task-bottom">
        <span className={`task-state ${isDone ? 'is-done' : ''} ${isDoing ? 'is-doing' : ''}`}>
          {isDone
            ? 'Completed'
            : isDoing
              ? (node.children.length ? `Doing (${childrenDone}/${node.children.length} done)` : 'Doing')
              : node.children.length
                ? `${childrenDone}/${node.children.length} subtasks done`
                : 'Open'}
          {isCollapsed && <span className="hidden-count">{hiddenCount} hidden {hiddenCount === 1 ? 'task' : 'tasks'}</span>}
        </span>
        <div className="task-actions">
          <NamedElement className="edit-task" disabled={busy} label={`Edit ${node.title}`} onClick={event => { event.stopPropagation(); onEdit(currentPath, node); }}>
            <Icon name="pencil" size={14}/>
          </NamedElement>
          <NamedElement className="delete-task" disabled={busy} label={`Delete ${node.title}`} onClick={event => { event.stopPropagation(); onDelete(currentPath, node); }}>
            <Icon name="trash" size={15}/>
          </NamedElement>
          <NamedElement className="add-child" disabled={busy} label={`Add subtask to ${node.title}`} onClick={event => { event.stopPropagation(); onAdd(currentPath); }}>
            <Icon name="plus" size={16}/>
          </NamedElement>
        </div>
      </div>
      {node.children.length > 0 && <div className="node-progress"><span style={{ width: `${childrenDone / node.children.length * 100}%` }}/></div>}
    </article>
    {hasChildren && <ul id={subtreeId} className="children" hidden={isCollapsed}>
      {!isCollapsed && node.children.map((child, index) => (
        <TaskBranch
          key={child.realPath ? child.realPath.join('.') : index}
          node={child}
          path={child.realPath || [...currentPath, index]}
          busy={busy}
          onToggle={onToggle}
          onCyclePriority={onCyclePriority}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={onDelete}
          onCollapse={onCollapse}
          onFocus={onFocus}
        />
      ))}
    </ul>}
  </li>;
}

function ConfirmDialog({ eyebrow = 'CONFIRMATION', title, message, confirmLabel = 'Confirm', confirmVariant = 'danger', onClose, onConfirm, busy }) {
  const dialog = useRef(null);
  const titleId = useId();
  const confirmBtn = useRef(null);
  useEffect(() => {
    dialog.current?.showModal();
    confirmBtn.current?.focus();
  }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="dialog-heading">
      <span className="eyebrow">{eyebrow}</span>
      <NamedElement type="button" className="icon-button" label="Close" disabled={busy} onClick={onClose}><Icon name="close"/></NamedElement>
    </div>
    <h2 id={titleId}>{title}</h2>
    <p>{message}</p>
    <div className="dialog-actions">
      <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button>
      <button ref={confirmBtn} type="button" className={confirmVariant === 'danger' ? 'danger-button' : 'primary-button'} disabled={busy} onClick={onConfirm}>
        {busy ? 'Processing…' : confirmLabel}
      </button>
    </div>
  </dialog>;
}

function TaskDialog({ parent, initialNode, onClose, onSubmit, busy, error }) {
  const dialog = useRef(null);
  const titleId = useId();
  const inputId = useId();
  const tagId = useId();
  const input = useRef(null);

  const isEditing = Boolean(initialNode);
  const [title, setTitle] = useState(initialNode?.title || '');
  const [tag, setTag] = useState(initialNode?.tag || '');

  useEffect(() => {
    dialog.current?.showModal();
    input.current?.focus();
  }, []);

  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form onSubmit={event => {
      event.preventDefault();
      if (title.trim() && !busy) {
        onSubmit({
          title: title.trim(),
          tag: tag.trim(),
        });
      }
    }}>
      <div className="dialog-heading">
        <span className="eyebrow">{isEditing ? 'TASK DETAILS' : parent ? 'A SMALLER STEP' : 'A NEW BEGINNING'}</span>
        <NamedElement type="button" className="icon-button" label="Close" disabled={busy} onClick={onClose}><Icon name="close"/></NamedElement>
      </div>
      <h2 id={titleId}>{isEditing ? 'Edit task' : parent ? 'Add a subtask' : 'Plant a new task'}</h2>
      <p>{isEditing ? 'Update task attributes and details.' : parent ? <>Under <strong>{parent.title}</strong></> : 'Start with the big picture. Break it down as you go.'}</p>

      <label htmlFor={inputId}>Task name</label>
      <input ref={input} id={inputId} value={title} onChange={event => setTitle(event.target.value)} maxLength={500} placeholder={parent ? 'What’s the next small step?' : 'What would you like to work on?'} required disabled={busy}/>

      <label htmlFor={tagId}>Tag</label>
      <input id={tagId} value={tag} onChange={event => setTag(event.target.value)} maxLength={100} placeholder="e.g. feature, personal, release" disabled={busy}/>

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="primary-button" disabled={!title.trim() || busy}>
          {busy ? 'Saving…' : isEditing ? 'Save changes' : parent ? 'Add subtask' : 'Add task'}
          <Icon name="arrow" size={16}/>
        </button>
      </div>
    </form>
  </dialog>;
}

export default function App({
  storage,
  workspaceLabel = '',
  mode = 'tree',
  onModeChange,
  onRegisterTextApi,
  onRegisterAppApi,
}) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [saved, setSaved] = useState(false);
  const [focusPath, setFocusPath] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);
  const [filterPriority, setFilterPriority] = useState(null);
  const [filterTag, setFilterTag] = useState(null);
  const working = useRef(false);
  const tree = data?.tree || [];
  const completedCount = useMemo(() => statistics(tree).done, [tree]);
  const focusKey = focusPath?.join('.') ?? 'main';
  const focusedNode = focusPath ? getNode(tree, focusPath) : null;

  const allTags = useMemo(() => getAllTags(tree), [tree]);
  const isFiltered = Boolean(filterStatus || filterPriority || filterTag);

  useEffect(() => {
    if (filterTag && !allTags.includes(filterTag)) {
      setFilterTag(null);
    }
  }, [allTags, filterTag]);

  function clearFilters() {
    setFilterStatus(null);
    setFilterPriority(null);
    setFilterTag(null);
  }

  const filters = useMemo(() => ({
    status: filterStatus,
    priority: filterPriority,
    tag: filterTag,
  }), [filterStatus, filterPriority, filterTag]);

  const displayTree = useMemo(() => {
    return filterTree(tree, filters);
  }, [tree, filters]);

  const displayFocusedNode = useMemo(() => {
    if (!focusPath) return null;
    const node = getNode(tree, focusPath);
    if (!node) return null;
    const filtered = filterTree([node], filters, focusPath);
    return filtered.length > 0 ? filtered[0] : null;
  }, [tree, focusPath, filters]);

  useEffect(() => {
    onRegisterAppApi?.({
      cleanUp: () => {
        if (completedCount > 0) {
          setError('');
          setCleaningUp(true);
        }
      },
      getCompletedCount: () => completedCount,
    });
  }, [onRegisterAppApi, completedCount]);

  function focusTask(path) {
    setFocusPath(path);
  }

  function hasCollapsibleBranches(subtree) {
    let canCollapse = false;
    let canExpand = false;
    function walk(nodes) {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          if (node.collapsed) canExpand = true;
          else canCollapse = true;
          walk(node.children);
        }
      }
    }
    walk(subtree);
    return { canCollapse, canExpand };
  }

  const currentBranches = displayFocusedNode ? [displayFocusedNode] : displayTree;
  const { canCollapse, canExpand } = hasCollapsibleBranches(currentBranches);

  async function handleCollapseAll(shouldCollapse) {
    try {
      const nextTree = setBranchesCollapsed(tree, shouldCollapse, focusPath);
      await save(nextTree);
    } catch (failure) {
      setError(getErrorMessage(failure));
    }
  }

  async function reload() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const value = await storage.read();
      setData(value); setError(''); setSaved(false);
      setFocusPath(null);
      clearFilters();
      setAdding(null);
      setEditing(null);
      setDeleting(null);
      setCleaningUp(false);
    } catch (failure) { setError(getErrorMessage(failure)); }
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

  useEffect(() => {
    if (mode === 'tree') {
      void reload();
    }
  }, [mode]);

  async function save(nextTree) {
    if (working.current) return false;
    working.current = true; setBusy(true); setError('');
    try {
      const value = await storage.save(nextTree, data.revision);
      setData(value); setSaved(true); return true;
    } catch (failure) { setError(getErrorMessage(failure)); return false; }
    finally { working.current = false; setBusy(false); }
  }

  function toggle(path) {
    void save(changeTree(tree, path, node => {
      const current = node.status || (node.done ? 'done' : 'open');
      const blocked = node.children && node.children.some(child => child.status !== 'done' && !child.done);

      if (current === 'open') {
        node.status = 'doing';
        node.done = false;
      } else if (current === 'doing') {
        if (blocked) {
          node.status = 'open';
          node.done = false;
        } else {
          node.status = 'done';
          node.done = true;
        }
      } else {
        node.status = 'open';
        node.done = false;
      }
    }));
  }

  function cyclePriority(path) {
    void save(changeTree(tree, path, node => {
      node.priority = nextPriority(node.priority || 'low');
    }));
  }

  function toggleBranch(path) {
    void save(changeTree(tree, path, node => {
      node.collapsed = !node.collapsed;
    }));
  }

  async function add({ title, tag }) {
    try {
      const node = {
        title,
        status: 'open',
        priority: 'low',
        tag: tag || '',
        collapsed: false,
        done: false,
        children: [],
      };
      const next = adding.length ? changeTree(tree, adding, parent => {
        parent.collapsed = false; // Reveal parent when child is added
        parent.children.push(node);
      }) : [...tree, node];
      if (await save(next)) {
        setAdding(null);
      }
    } catch (failure) { setError(getErrorMessage(failure)); }
  }

  async function editTask({ title, tag }) {
    if (!editing) return;
    try {
      const next = changeTree(tree, editing.path, target => {
        target.title = title;
        target.tag = tag;
      });
      if (await save(next)) {
        setEditing(null);
      }
    } catch (failure) { setError(getErrorMessage(failure)); }
  }

  function handleDeleteRequest(path, node) {
    setError('');
    const childStats = statistics(node.children);
    const incompleteCount = childStats.total - childStats.done;
    if (node.children.length > 0 && incompleteCount > 0) {
      setDeleting({ path, node, incompleteCount });
    } else {
      void executeDelete(path);
    }
  }

  async function executeDelete(path) {
    try {
      const nextTree = deleteNode(tree, path);
      setFocusPath(prev => adjustPathAfterDelete(prev, path));
      return await save(nextTree);
    } catch (failure) {
      setError(getErrorMessage(failure));
      return false;
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const path = deleting.path;
    setDeleting(null);
    await executeDelete(path);
  }

  async function executeCleanup() {
    setCleaningUp(false);
    try {
      const nextTree = removeCompleted(tree);
      setFocusPath(null);
      await save(nextTree);
    } catch (failure) {
      setError(getErrorMessage(failure));
    }
  }

  if (mode === 'text') {
    return (
      <NamedElement as="main" className="app" label="Tree Work">
        <TextView
          storage={storage}
          workspaceLabel={workspaceLabel}
          initialContent={data?.revision}
          onSwitchToTree={() => onModeChange?.('tree')}
          onRegisterApi={onRegisterTextApi}
        />
      </NamedElement>
    );
  }

  const filterControls = (
    <div className="filter-bar">
      <div className="filter-header-label">
        <Icon name="filter" size={13}/>
        <span>Filter:</span>
      </div>
      <div className="filter-group">
        <span className="filter-group-title">Status</span>
        <button
          type="button"
          className={`filter-pill ${!filterStatus ? 'active' : ''}`}
          disabled={busy}
          onClick={() => setFilterStatus(null)}
        >All</button>
        <button
          type="button"
          className={`filter-pill ${filterStatus === 'open' ? 'active' : ''}`}
          disabled={busy}
          onClick={() => setFilterStatus(prev => prev === 'open' ? null : 'open')}
        >Open</button>
        <button
          type="button"
          className={`filter-pill ${filterStatus === 'doing' ? 'active' : ''}`}
          disabled={busy}
          onClick={() => setFilterStatus(prev => prev === 'doing' ? null : 'doing')}
        >Doing</button>
        <button
          type="button"
          className={`filter-pill ${filterStatus === 'done' ? 'active' : ''}`}
          disabled={busy}
          onClick={() => setFilterStatus(prev => prev === 'done' ? null : 'done')}
        >Done</button>
      </div>
      <div className="filter-divider"/>
      <div className="filter-group">
        <span className="filter-group-title">Priority</span>
        <button
          type="button"
          className={`filter-pill ${!filterPriority ? 'active' : ''}`}
          disabled={busy}
          onClick={() => setFilterPriority(null)}
        >All</button>
        <button
          type="button"
          className={`filter-pill ${filterPriority === 'low' ? 'active' : ''}`}
          disabled={busy}
          onClick={() => setFilterPriority(prev => prev === 'low' ? null : 'low')}
        >Low</button>
        <button
          type="button"
          className={`filter-pill ${filterPriority === 'medium' ? 'active' : ''}`}
          disabled={busy}
          onClick={() => setFilterPriority(prev => prev === 'medium' ? null : 'medium')}
        >Medium</button>
        <button
          type="button"
          className={`filter-pill ${filterPriority === 'high' ? 'active' : ''}`}
          disabled={busy}
          onClick={() => setFilterPriority(prev => prev === 'high' ? null : 'high')}
        >High</button>
      </div>
      {allTags.length > 0 && <>
        <div className="filter-divider"/>
        <div className="filter-group">
          <span className="filter-group-title">Tags</span>
          <button
            type="button"
            className={`filter-pill ${!filterTag ? 'active' : ''}`}
            disabled={busy}
            onClick={() => setFilterTag(null)}
          >All</button>
          {allTags.map(tag => (
            <button
              key={tag}
              type="button"
              className={`filter-pill filter-tag ${filterTag === tag ? 'active' : ''}`}
              disabled={busy}
              onClick={() => setFilterTag(prev => prev === tag ? null : tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      </>}
      {isFiltered && (
        <button
          type="button"
          className="clear-filters-button"
          disabled={busy}
          onClick={clearFilters}
          title="Reset active filters"
        >
          <Icon name="close" size={12}/>
          <span>Reset</span>
        </button>
      )}
    </div>
  );

  return <NamedElement as="main" className="app" label="Tree Work">
    <TreeCanvas
      ready={!!data}
      navigationKey={`${focusKey}-${filterStatus || 'all'}-${filterPriority || 'all'}-${filterTag || 'all'}`}
      filterControls={filterControls}
      navigationControls={focusedNode && <button className="text-button back-to-root" onClick={() => setFocusPath(null)}><Icon name="back" size={16}/>Back to all tasks</button>}
      branchControls={<>
        <button className="text-button" disabled={!canCollapse} onClick={() => handleCollapseAll(true)}>Collapse all</button>
        <button className="text-button" disabled={!canExpand} onClick={() => handleCollapseAll(false)}>Expand all</button>
      </>}
      controls={<>
        {(busy || error || saved || workspaceLabel) ? (
          <span className="save-status" role="status">{busy ? 'Saving / loading…' : error ? 'File needs attention' : saved ? 'All changes saved' : workspaceLabel}</span>
        ) : null}
        <button
          type="button"
          className="text-button"
          disabled={busy || completedCount === 0}
          title={completedCount === 0 ? 'No completed tasks to clean up' : `Clean up ${completedCount} completed ${completedCount === 1 ? 'todo' : 'todos'}`}
          onClick={() => { setError(''); setCleaningUp(true); }}
        >
          <Icon name="broom" size={15}/>
          <span>Clean up completed{completedCount > 0 ? ` (${completedCount})` : ''}</span>
        </button>
        <button type="button" className="text-button" disabled={busy} onClick={() => onModeChange?.('text')}><Icon name="fileText" size={15}/><span>Switch to text view</span></button>
        <button type="button" className="text-button" disabled={busy} onClick={reload}><Icon name="refresh" size={15}/><span>Reload file</span></button>
      </>}
    >
      {!data ? <div className="loading-state">
        <p>{error ? error : 'Opening your workspace…'}</p>
        {error && <div style={{ marginTop: '14px' }}>
          <button type="button" className="primary-button" onClick={() => onModeChange?.('text')}>
            <Icon name="fileText" size={15}/>
            <span>Switch to text view to fix file</span>
          </button>
        </div>}
      </div> : (
        <div className="forest">
          {displayFocusedNode ? <ul className="focused-tree">
            <TaskBranch
              key={focusKey}
              node={displayFocusedNode}
              path={displayFocusedNode.realPath || focusPath}
              busy={busy}
              onToggle={toggle}
              onCyclePriority={cyclePriority}
              onAdd={path => { setError(''); setAdding(path); }}
              onEdit={(path, node) => { setError(''); setEditing({ path, node }); }}
              onDelete={handleDeleteRequest}
              onCollapse={toggleBranch}
              onFocus={focusTask}
              isFocusRoot
            />
          </ul> : focusPath && !displayFocusedNode ? (
            <div className="empty-filter-state">
              <p>No tasks in this focused branch match the active filters.</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="secondary-button" onClick={() => setFocusPath(null)}>
                  Back to all tasks
                </button>
                <button type="button" className="secondary-button" onClick={clearFilters}>
                  Reset filters
                </button>
              </div>
            </div>
          ) : isFiltered && displayTree.length === 0 ? (
            <div className="empty-filter-state">
              <p>No tasks match the active filters.</p>
              <button type="button" className="secondary-button" onClick={clearFilters}>
                Reset filters
              </button>
            </div>
          ) : <>
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
          {displayTree.length > 0 && <ul className="children root-branches">
            {displayTree.map((node, index) => (
              <TaskBranch
                key={node.realPath ? node.realPath.join('.') : index}
                node={node}
                path={node.realPath || [index]}
                busy={busy}
                onToggle={toggle}
                onCyclePriority={cyclePriority}
                onAdd={path => { setError(''); setAdding(path); }}
                onEdit={(path, n) => { setError(''); setEditing({ path, node: n }); }}
                onDelete={handleDeleteRequest}
                onCollapse={toggleBranch}
                onFocus={focusTask}
              />
            ))}
          </ul>}
          </>}
        </div>
      )}
    </TreeCanvas>
    {error && adding === null && editing === null && deleting === null && !cleaningUp && <div className="error-banner" role="alert">{error}</div>}
    {adding !== null && <TaskDialog parent={adding.length ? getNode(tree, adding) : null} onClose={() => setAdding(null)} onSubmit={add} busy={busy} error={error}/>}
    {editing !== null && <TaskDialog initialNode={editing.node} onClose={() => setEditing(null)} onSubmit={editTask} busy={busy} error={error}/>}
    {deleting !== null && (
      <ConfirmDialog
        eyebrow="INCOMPLETE SUBTASKS"
        title="Delete task?"
        message={`"${deleting.node.title}" has ${deleting.incompleteCount} incomplete ${deleting.incompleteCount === 1 ? 'subtask' : 'subtasks'}. Do you want to delete it and all its subtasks?`}
        confirmLabel="Delete task"
        confirmVariant="danger"
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    )}
    {cleaningUp && (
      <ConfirmDialog
        eyebrow="CLEAN UP COMPLETED"
        title="Clean up completed tasks?"
        message={`Do you want to clean up ${completedCount} completed ${completedCount === 1 ? 'todo' : 'todos'}? This will remove them from the file.`}
        confirmLabel={`Clean up ${completedCount} ${completedCount === 1 ? 'todo' : 'todos'}`}
        confirmVariant="danger"
        busy={busy}
        onClose={() => setCleaningUp(false)}
        onConfirm={executeCleanup}
      />
    )}
  </NamedElement>;
}

