/**
 * ErrorBoundary.tsx
 * 
 * A React Error Boundary component that catches JavaScript errors in its child
 * component tree and displays a fallback UI. This ensures that the application
 * remains partially functional even if a specific component crashes.
 */

import React, { ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // You can also log the error to an error reporting service here
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div className="p-4 bg-red-100 text-red-900 rounded-lg m-4 w-full h-full overflow-auto">
          <h2 className="text-lg font-bold mb-2">Something went wrong.</h2>
          <pre className="text-xs overflow-auto p-2 bg-red-50 rounded">{this.state.error?.message}</pre>
          <pre className="text-xs overflow-auto p-2 bg-red-50 rounded mt-2">{this.state.error?.stack}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}
