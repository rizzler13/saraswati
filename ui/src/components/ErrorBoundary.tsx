import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('React error boundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 40, textAlign: 'center', fontFamily: 'system-ui',
          maxWidth: 600, margin: '80px auto'
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
            Something went wrong
          </h2>
          <p style={{ color: '#666', marginBottom: 20, fontSize: 14 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
            style={{
              padding: '8px 20px', background: '#c9553a', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
              fontWeight: 600
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
