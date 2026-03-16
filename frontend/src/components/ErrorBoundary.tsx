import React from 'react';
import * as Sentry from '@sentry/react';

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'Arial, sans-serif',
          textAlign: 'center',
          padding: '2rem',
        }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#1f2937' }}>
            Diçka shkoi keq
          </h1>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
            Ndodhi një gabim i papritur. Ju lutemi provoni të ringarkoni faqen.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Ringarko Faqen
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
