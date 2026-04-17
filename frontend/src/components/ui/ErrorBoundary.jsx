import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-mist flex items-center justify-center p-6">
          <div className="card p-10 max-w-md text-center">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <AlertTriangle size={28} className="text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-ink mb-2">Something went wrong</h2>
            <p className="text-ink/50 text-sm mb-6 leading-relaxed">
              An unexpected error occurred. This has been logged and we'll look into it.
            </p>
            {this.state.error?.message && (
              <pre className="text-xs bg-red-50 text-red-600 rounded-xl p-3 mb-5 text-left overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="btn-secondary text-sm"
              >
                <RefreshCw size={14} /> Try again
              </button>
              <button
                onClick={() => window.location.href = '/dashboard'}
                className="btn-primary text-sm"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
