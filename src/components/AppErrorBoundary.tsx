import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error?: Error };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('PDS React runtime failure', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <div data-runtime-error role="alert" style={{ padding: 24, fontFamily: 'system-ui', color: '#f2c1c1', background: '#130f11', minHeight: '100vh' }}>
        <strong>PDS 运行时错误</strong>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
      </div>;
    }
    return this.props.children;
  }
}
