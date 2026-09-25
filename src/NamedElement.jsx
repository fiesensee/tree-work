import React, { useId } from 'react';

// Obsidian turns aria-label attributes into hover tooltips. Referenced hidden
// text supplies the same accessible name without triggering those tooltips.
export default function NamedElement({ as: Element = 'button', label, children, ...props }) {
  const labelId = useId();
  return <Element {...props} aria-labelledby={labelId}>
    <span id={labelId} hidden>{label}</span>
    {children}
  </Element>;
}
