import React, { useLayoutEffect, useRef, useState } from 'react';

const PADDING = 24;
const MAX_ZOOM = 2;

export default function TreeCanvas({ children, ready, controls, branchControls, navigationKey = 'main', navigationControls }) {
  const viewport = useRef(null);
  const content = useRef(null);
  const toolbar = useRef(null);
  const pendingAnchor = useRef(null);
  const previousNavigation = useRef(navigationKey);
  const [size, setSize] = useState({ width: 0, height: 0, contentWidth: 0, contentHeight: 0, bottom: 80 });
  const [manualZoom, setManualZoom] = useState(1);
  const [fitting, setFitting] = useState(false);

  useLayoutEffect(() => {
    if (previousNavigation.current === navigationKey) return;
    previousNavigation.current = navigationKey;
    pendingAnchor.current = null;
    setFitting(true);
    viewport.current.scrollTo(0, 0);
  }, [navigationKey]);

  useLayoutEffect(() => {
    const measure = () => {
      const next = {
        width: viewport.current.clientWidth,
        height: viewport.current.clientHeight,
        contentWidth: content.current.offsetWidth,
        contentHeight: content.current.offsetHeight,
        bottom: toolbar.current.offsetHeight + 32,
      };
      setSize(previous => Object.keys(next).every(key => previous[key] === next[key]) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport.current);
    observer.observe(content.current);
    observer.observe(toolbar.current);
    measure();
    return () => observer.disconnect();
  }, []);

  const fitZoom = Math.max(0.0001, Math.min(1,
    Math.max(1, size.width - PADDING * 2) / Math.max(1, size.contentWidth),
    Math.max(1, size.height - size.bottom - PADDING * 2) / Math.max(1, size.contentHeight),
  ));
  const minZoom = Math.min(0.1, fitZoom);
  const zoom = fitting ? fitZoom : manualZoom;
  const stageWidth = Math.max(size.width, size.contentWidth * zoom + PADDING * 2);
  const stageHeight = Math.max(size.height, size.contentHeight * zoom + PADDING * 2 + size.bottom);
  const left = (stageWidth - size.contentWidth * zoom) / 2;
  const top = (stageHeight - size.bottom - size.contentHeight * zoom) / 2;

  // Keep the same point of the tree under the viewport center when zooming.
  useLayoutEffect(() => {
    if (fitting) {
      viewport.current.scrollTo(0, 0);
    } else if (pendingAnchor.current) {
      const anchor = pendingAnchor.current;
      viewport.current.scrollTo(left + anchor.x * zoom - anchor.centerX, top + anchor.y * zoom - anchor.centerY);
    }
    pendingAnchor.current = null;
  }, [zoom, fitting, left, top]);

  function changeZoom(value) {
    const centerX = size.width / 2;
    const centerY = Math.max(0, size.height - size.bottom) / 2;
    pendingAnchor.current = {
      x: (viewport.current.scrollLeft + centerX - left) / zoom,
      y: (viewport.current.scrollTop + centerY - top) / zoom,
      centerX,
      centerY,
    };
    setManualZoom(Math.min(MAX_ZOOM, Math.max(minZoom, value)));
    setFitting(false);
  }

  const percentage = zoom < 0.1 ? `${Number((zoom * 100).toFixed(1))}%` : `${Math.round(zoom * 100)}%`;

  return <>
    <div ref={viewport} className="tree-canvas" tabIndex={0} role="region" aria-label="Task tree. Scroll to explore branches.">
      <div className="tree-stage" style={{ width: stageWidth, height: stageHeight }}>
        <div ref={content} className="tree-content" style={{ left, top, transform: `scale(${zoom})` }}>
          {children}
        </div>
      </div>
    </div>
    <div ref={toolbar} className="canvas-footer">
      {navigationControls && <div className="navigation-controls">{navigationControls}</div>}
      <div className="zoom-controls" role="group" aria-label="Graph zoom">
        <button aria-label="Zoom out" title="Zoom out" disabled={!ready || zoom <= minZoom} onClick={() => changeZoom(zoom / 1.25)}>−</button>
        <button className="zoom-percentage" aria-label={`Zoom ${percentage}. Reset to 100%`} title="Reset to 100%" disabled={!ready} onClick={() => changeZoom(1)}>{percentage}</button>
        <button aria-label="Zoom in" title="Zoom in" disabled={!ready || zoom >= MAX_ZOOM} onClick={() => changeZoom(zoom * 1.25)}>+</button>
        <span className="zoom-divider"/>
        <button className="fit-button" aria-pressed={fitting} disabled={!ready} onClick={() => setFitting(true)}>Fit all</button>
      </div>
      <div className="branch-controls" role="group" aria-label="Branch visibility">{branchControls}</div>
      <div className="canvas-controls">{controls}</div>
    </div>
  </>;
}
