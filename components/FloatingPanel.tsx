import { useState, type ReactNode } from 'react';

export function FloatingPanel({ title, children }: { title: string; children: ReactNode }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  return <section
    className="floating-panel"
    aria-label={title}
    data-floating-panel
    style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
  >
    <header
      className="floating-panel-title"
      onDoubleClick={() => setPosition({ x: 0, y: 0 })}
      title="双击复位面板位置"
    >{title}</header>
    <div className="floating-panel-body">{children}</div>
  </section>;
}
