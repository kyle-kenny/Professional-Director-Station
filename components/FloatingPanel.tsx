import type { ReactNode } from 'react';

export function FloatingPanel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="floating-panel" aria-label={title}>
    <header className="floating-panel-title">{title}</header>
    <div className="floating-panel-body">{children}</div>
  </section>;
}
