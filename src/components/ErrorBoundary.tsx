import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="crt h-screen bg-black text-green-500 font-mono p-8 flex flex-col items-center justify-center">
          <h1 className="text-4xl font-black mb-4 uppercase tracking-widest">SYSTEM MALFUNCTION</h1>
          <p className="text-lg mb-2 opacity-80">A critical error has occurred in the Pip-Boy operating system.</p>
          <p className="text-sm mb-8 text-green-700">{this.state.error?.message}</p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="border-2 border-green-500 px-8 py-4 text-xl hover:bg-green-900 transition-colors uppercase tracking-widest font-bold"
          >
            REBOOT SYSTEM
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
