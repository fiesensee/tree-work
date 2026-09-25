import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';

const storage = {
  async read() {
    const response = await fetch('/api/tasks');
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Could not load the task file.');
    return value;
  },
  async save(tree, revision) {
    const response = await fetch('/api/tasks', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tree, revision }),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Could not save the task file.');
    return value;
  },
};
const container = document.getElementById('root');
container.classList.add('tree-work-root');
container.style.height = '100dvh';
createRoot(container).render(<App storage={storage}/>);
