import React, { useEffect, useRef, useState } from 'react';
import { getErrorMessage, parseTree, statistics } from '../shared/tree.js';
import NamedElement from './NamedElement.jsx';

function Icon({ name, size = 18, ...props }) {
  const paths = {
    branch: <><path d="M6 4v16M6 12h12V4"/><circle cx="6" cy="4" r="2"/><circle cx="18" cy="4" r="2"/><circle cx="6" cy="20" r="2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>,
    alert: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

export default function TextView({
  storage,
  onSwitchToTree,
  workspaceLabel = '',
  initialContent = '',
  onRegisterApi,
}) {
  const [text, setText] = useState(initialContent);
  const [initialText, setInitialText] = useState(initialContent);
  const [revision, setRevision] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [syntaxStatus, setSyntaxStatus] = useState(() => {
    if (!initialContent) return { valid: true, error: null, taskCount: 0 };
    try {
      const tree = parseTree(initialContent);
      return { valid: true, error: null, taskCount: statistics(tree).total };
    } catch (failure) {
      return { valid: false, error: getErrorMessage(failure), taskCount: 0 };
    }
  });

  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const workingRef = useRef(false);
  const dirtyRef = useRef(false);

  const isDirty = text !== initialText;
  dirtyRef.current = isDirty;

  function validate(content) {
    try {
      const tree = parseTree(content);
      const stats = statistics(tree);
      setSyntaxStatus({ valid: true, error: null, taskCount: stats.total });
      return { valid: true, error: null };
    } catch (failure) {
      const message = getErrorMessage(failure);
      setSyntaxStatus({ valid: false, error: message, taskCount: 0 });
      return { valid: false, error: message };
    }
  }

  async function load() {
    if (workingRef.current) return;
    workingRef.current = true;
    setBusy(true);
    try {
      const result = await storage.readText();
      setText(result.text);
      setInitialText(result.text);
      setRevision(result.revision);
      setError('');
      setSaved(false);
      validate(result.text);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      workingRef.current = false;
      setBusy(false);
    }
  }

  async function save(contentToSave = text) {
    if (workingRef.current) return false;
    workingRef.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await storage.saveText(contentToSave, revision);
      setRevision(result.revision);
      setInitialText(contentToSave);
      setSaved(true);
      return true;
    } catch (failure) {
      setError(getErrorMessage(failure));
      return false;
    } finally {
      workingRef.current = false;
      setBusy(false);
    }
  }

  async function handleSwitchToTree() {
    const val = validate(text);
    if (!val.valid) {
      setError(`Cannot switch to tree view: ${val.error}`);
      textareaRef.current?.focus();
      return false;
    }
    if (isDirty) {
      const ok = await save(text);
      if (!ok) return false;
    }
    onSwitchToTree?.();
    return true;
  }

  useEffect(() => {
    onRegisterApi?.({
      switchToTree: handleSwitchToTree,
    });
    return () => onRegisterApi?.(null);
  });

  useEffect(() => {
    void load();
    const unsubscribe = storage.subscribe?.(() => {
      if (!dirtyRef.current) {
        void load();
      } else {
        setError('This file changed outside this view. Reload file before making more changes.');
        setSaved(false);
      }
    });
    return unsubscribe;
  }, [storage]);

  function handleTextChange(e) {
    const next = e.target.value;
    setText(next);
    setSaved(false);
    validate(next);
  }

  function handleScroll() {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }

  function handleKeyDown(e) {
    const target = textareaRef.current;
    if (!target) return;

    // Ctrl+S / Cmd+S: Save immediately
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void save();
      return;
    }

    // Tab / Shift+Tab: Indentation handling
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;

      if (start === end) {
        if (!e.shiftKey) {
          // Insert 2 spaces at cursor position
          const next = val.substring(0, start) + '  ' + val.substring(end);
          setText(next);
          setSaved(false);
          validate(next);
          window.requestAnimationFrame(() => {
            target.selectionStart = target.selectionEnd = start + 2;
          });
        } else {
          // Shift+Tab: remove up to 2 leading spaces from current line
          const lineStart = val.lastIndexOf('\n', start - 1) + 1;
          const leadingSpaces = val.substring(lineStart, start).match(/^ +/)?.[0]?.length || 0;
          const toRemove = Math.min(2, leadingSpaces);
          if (toRemove > 0) {
            const next = val.substring(0, lineStart) + val.substring(lineStart + toRemove);
            setText(next);
            setSaved(false);
            validate(next);
            window.requestAnimationFrame(() => {
              target.selectionStart = target.selectionEnd = Math.max(lineStart, start - toRemove);
            });
          }
        }
      } else {
        // Multi-line selection: indent or outdent lines
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = val.indexOf('\n', end);
        const effectiveEnd = lineEnd === -1 ? val.length : lineEnd;
        const selectedBlock = val.substring(lineStart, effectiveEnd);
        const lines = selectedBlock.split('\n');

        let diff = 0;
        let modifiedLines;
        if (!e.shiftKey) {
          modifiedLines = lines.map(line => {
            if (!line.trim()) return line;
            diff += 2;
            return '  ' + line;
          });
        } else {
          modifiedLines = lines.map(line => {
            const match = line.match(/^ {1,2}/);
            if (match) {
              diff -= match[0].length;
              return line.substring(match[0].length);
            }
            return line;
          });
        }
        const next = val.substring(0, lineStart) + modifiedLines.join('\n') + val.substring(effectiveEnd);
        setText(next);
        setSaved(false);
        validate(next);
        window.requestAnimationFrame(() => {
          target.selectionStart = lineStart;
          target.selectionEnd = Math.max(lineStart, effectiveEnd + diff);
        });
      }
      return;
    }

    // Enter key: Checklist continuation / unindent empty checklist
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const start = target.selectionStart;
      const end = target.selectionEnd;
      if (start === end) {
        const val = target.value;
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        const currentLine = val.substring(lineStart, start);
        const match = currentLine.match(/^( *)- \[([ xX])\] (.*)$/);

        if (match) {
          e.preventDefault();
          const indent = match[1];
          const taskContent = match[3];

          if (taskContent.trim() === '') {
            // Empty checklist line: unindent or clear checkbox prefix
            const next = val.substring(0, lineStart) + indent + val.substring(start);
            setText(next);
            setSaved(false);
            validate(next);
            window.requestAnimationFrame(() => {
              target.selectionStart = target.selectionEnd = lineStart + indent.length;
            });
          } else {
            // New checklist item with same indent
            const insert = `\n${indent}- [ ] `;
            const next = val.substring(0, start) + insert + val.substring(end);
            setText(next);
            setSaved(false);
            validate(next);
            window.requestAnimationFrame(() => {
              target.selectionStart = target.selectionEnd = start + insert.length;
            });
          }
        }
      }
    }
  }

  const lines = text.split('\n');
  const lineCount = Math.max(1, lines.length);

  return (
    <NamedElement as="div" className="tree-work-text-view" label="Text Editor">
      <div className="tree-work-text-toolbar">
        <div className="tree-work-text-toolbar-group">
          <button
            type="button"
            className="primary-button switch-mode-button"
            onClick={handleSwitchToTree}
            disabled={busy}
          >
            <Icon name="branch" size={16} />
            <span>Switch to tree view</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void save()}
            disabled={busy || (!isDirty && saved)}
          >
            <Icon name="save" size={15} />
            <span>Save</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void load()}
            disabled={busy}
          >
            <Icon name="refresh" size={15} />
            <span>Reload</span>
          </button>
        </div>

        <div className="tree-work-text-toolbar-group">
          {(busy || error || saved || isDirty || workspaceLabel) ? (
            <span className="save-status" role="status">
              {busy ? 'Saving / loading…' : error ? 'Error' : saved ? 'All changes saved' : isDirty ? 'Unsaved changes' : workspaceLabel}
            </span>
          ) : null}
          <span
            className={`tree-work-validation ${syntaxStatus.valid ? 'is-valid' : 'is-invalid'}`}
            title={syntaxStatus.valid ? `${syntaxStatus.taskCount} tasks` : syntaxStatus.error}
          >
            {syntaxStatus.valid
              ? `✓ Valid tree (${syntaxStatus.taskCount} ${syntaxStatus.taskCount === 1 ? 'task' : 'tasks'})`
              : `⚠ ${syntaxStatus.error}`}
          </span>
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <div className="tree-work-text-editor-container">
        <div ref={lineNumbersRef} className="tree-work-line-numbers" aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i + 1}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="tree-work-textarea"
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          spellCheck={false}
          placeholder="- [ ] My first task"
          aria-label="Tree file content"
        />
      </div>
    </NamedElement>
  );
}
