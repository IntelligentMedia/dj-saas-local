import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h2>⚠️ Something went wrong</h2>
            <p className="error-message">{this.state.error?.message || "Unknown error"}</p>
            {this.props.fallbackMessage && (
              <p className="error-context">{this.props.fallbackMessage}</p>
            )}
            <div className="error-actions">
              <button className="deck-btn" onClick={this.handleReset}>🔄 Try Again</button>
              <button className="deck-btn" onClick={() => window.location.reload()}>🔃 Reload Page</button>
            </div>
            {process.env.NODE_ENV !== "production" && this.state.errorInfo && (
              <details className="error-details">
                <summary>Stack Trace</summary>
                <pre>{this.state.errorInfo.componentStack}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
