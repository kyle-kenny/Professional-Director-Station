import type { ReactNode } from 'react';

export function FloatingPanel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="floating-panel" aria-label={title} data-floating-panel>
    <header className="floating-panel-title" draggable>{title}</header>
    <div className="floating-panel-body">{children}</div>
  </section>;
}
