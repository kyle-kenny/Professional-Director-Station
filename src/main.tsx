import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './styles.css';
import './editorial.css';
import './review.css';
import './pipeline.css';
import './ai.css';
import './assets-workspace.css';
import './integrity.css';
import './pose.css';
import './director-console.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
);
