import React from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import './ErrorBoundary.css';
import logger from '../utils/logger';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    logger.error('Error boundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-boundary-icon">
              <AlertCircle size={64} />
            </div>

            <h1 className="error-boundary-title">Something went wrong</h1>

            <p className="error-boundary-message">
              We're sorry, but something unexpected happened.
              {this.state.error && (
                <span className="error-boundary-detail">
                  {this.state.error.toString()}
                </span>
              )}
            </p>

            <div className="error-boundary-actions">
              <button
                onClick={this.handleReset}
                className="btn-error-primary"
              >
                <RefreshCw size={18} />
                Try Again
              </button>

              <button
                onClick={this.handleGoHome}
                className="btn-error-secondary"
              >
                <Home size={18} />
                Go to Dashboard
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <details className="error-boundary-details">
                <summary>Error Details (Development Only)</summary>
                <pre className="error-boundary-stack">
                  {this.state.errorInfo.componentStack}
                </pre>
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
