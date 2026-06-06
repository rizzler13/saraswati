/**
 * AuthModal — Login/Signup modal with email+password and Google sign-in.
 * Handles in-app browsers (LinkedIn, Instagram, etc.) gracefully:
 * - Always shows Google sign-in (never hides it based on UA detection)
 * - If Google OAuth fails with disallowed_useragent, shows escape hatch
 * - Provides "Open in Browser" and "Copy Link" as recovery actions
 */
import { useState } from 'react'
import { useAuth, isInAppBrowser } from './AuthContext'

interface AuthModalProps {
  onClose: () => void
  initialMode?: 'login' | 'signup'
}

export function AuthModal({ onClose, initialMode = 'login' }: AuthModalProps) {
  const { login, signup, loginWithGoogle, configured } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showWebViewHelp, setShowWebViewHelp] = useState(isInAppBrowser())
  const [copied, setCopied] = useState(false)

  if (!configured) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal auth-modal" onClick={e => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>×</button>
          <h2 className="auth-modal-title">Authentication</h2>
          <p className="auth-modal-note">
            Firebase is not configured. Add VITE_FIREBASE_* variables to your .env file.
          </p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await signup(email, password)
      }
      onClose()
    } catch (err: any) {
      const msg = err?.code === 'auth/invalid-credential'
        ? 'Invalid email or password'
        : err?.code === 'auth/email-already-in-use'
        ? 'Email already in use'
        : err?.code === 'auth/weak-password'
        ? 'Password must be at least 6 characters'
        : err?.message || 'Authentication failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError(null)
    setShowWebViewHelp(false)
    setLoading(true)
    try {
      await loginWithGoogle()
      onClose()
    } catch (err: any) {
      const isWebViewBlock =
        err?.message?.includes('disallowed_useragent') ||
        err?.code === 'auth/popup-blocked' ||
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.message?.includes('popup') ||
        err?.message?.includes('Cross-Origin-Opener-Policy')

      if (isWebViewBlock) {
        // Show the escape hatch UI instead of a plain error
        setShowWebViewHelp(true)
        setError(null)
      } else {
        setError(err?.message || 'Google sign-in failed')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = window.location.href
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const handleOpenInBrowser = () => {
    const url = window.location.href
    // Android: intent:// scheme to launch system browser
    if (/android/i.test(navigator.userAgent)) {
      window.location.href = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`
      return
    }
    // iOS: try x-safari-https scheme, fall back to window.open
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      // This opens Safari on iOS if available
      window.location.href = `x-safari-${url}`
      // Fallback after a short delay if scheme didn't work
      setTimeout(() => window.open(url, '_blank'), 300)
      return
    }
    window.open(url, '_blank')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal auth-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        <h2 className="auth-modal-title">
          {mode === 'login' ? 'Welcome Back' : 'Create Account'}
        </h2>
        <p className="auth-modal-subtitle">
          {mode === 'login'
            ? 'Sign in to track your research'
            : 'Join Saraswati to save your papers'}
        </p>

        {/* Google sign-in — always visible */}
        <button className="auth-google-btn" onClick={handleGoogle} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        {/* WebView help — shown only AFTER Google sign-in fails */}
        {showWebViewHelp && (
          <div className="auth-webview-help">
            <div className="auth-inapp-warning">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>
                Google sign-in is blocked in this browser. Open the link in <strong>Safari</strong> or <strong>Chrome</strong> to use Google, or sign in with email below.
              </span>
            </div>
            <div className="auth-inapp-actions">
              <button className="auth-open-browser-btn" onClick={handleOpenInBrowser}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Open in Safari / Chrome
              </button>
              <button className="auth-copy-url-btn" onClick={handleCopyUrl}>
                {copied ? '✓ Copied!' : 'Copy Link'}
              </button>
            </div>
            <p className="auth-webview-tip">
              💡 Tip: Tap <strong>⋯</strong> in the toolbar above → <strong>Open in Safari</strong>
            </p>
          </div>
        )}

        <div className="auth-divider">
          <span>or</span>
        </div>

        {/* Email form — always available */}
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="email"
            placeholder="Email"
            className="auth-input"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            type="password"
            placeholder="Password"
            className="auth-input"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? (
            <span>Don't have an account? <button onClick={() => setMode('signup')}>Sign Up</button></span>
          ) : (
            <span>Already have an account? <button onClick={() => setMode('login')}>Sign In</button></span>
          )}
        </div>
      </div>
    </div>
  )
}