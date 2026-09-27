import React, { Component } from 'react';

/**
 * Beklenmeyen render hatalarında uygulamayı ayakta tutar.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('UI error boundary:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            padding: '1.5rem',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
            color: '#333',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '1.15rem' }}>Something went wrong</h1>
          <p style={{ margin: 0, maxWidth: 360, color: '#666', fontSize: '0.9rem' }}>
            The app hit an unexpected error. Reloading usually fixes it — your local binders are
            kept on this device.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              marginTop: '0.5rem',
              padding: '0.55rem 1rem',
              borderRadius: 8,
              border: 'none',
              background: '#1a5fb4',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
