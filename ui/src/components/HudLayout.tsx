/**
 * HudLayout — Top navigation shell using the existing navbar CSS classes.
 */
import { useState, type ReactNode } from 'react'
import { useAuth } from './auth/AuthContext'
import { AuthModal } from './auth/AuthModal'

export type TabView = 'trending' | 'methods' | 'research' | 'profile' | 'agent'

interface HudLayoutProps {
  activeTab: TabView
  onTabChange: (tab: TabView) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  children: ReactNode
}

export function HudLayout({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  children,
}: HudLayoutProps) {
  const { user, configured } = useAuth()
  const [showAuth, setShowAuth] = useState(false)

  return (
    <>
      {/* Top bar — uses existing .navbar CSS */}
      <header className="navbar">
        <div className="navbar-inner">
          <div className="logo" style={{ cursor: 'pointer' }} onClick={() => onTabChange('trending')}>
            <div className="logo-icon" />
            <span className="logo-text">
              saraswati
            </span>
          </div>

          {/* Tabs — uses existing .nav-links */}
          <nav className="nav-links">
            {([
              { id: 'trending' as TabView, label: 'Trending' },
              { id: 'methods' as TabView, label: 'Methods' },
              { id: 'research' as TabView, label: 'Deep Dives' },
              { id: 'agent' as TabView, label: 'Agent Chat' },
            ]).map(tab => (
              <button
                key={tab.id}
                className={`nav-link ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Search (only on trending tab) */}
          {activeTab === 'trending' && (
            <div className="search-bar">
              <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="search-input"
                placeholder="Filter papers..."
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
              />
            </div>
          )}

          {/* Auth indicator — right side */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            {user ? (
              <button
                className={`nav-link ${activeTab === 'profile' ? 'active' : ''}`}
                onClick={() => onTabChange('profile')}
                title={user.email || 'Profile'}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                ) : (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 24, height: 24, borderRadius: '50%', background: '#c9553a',
                    color: '#fff', fontSize: 11, fontWeight: 700
                  }}>
                    {(user.email || 'U')[0].toUpperCase()}
                  </span>
                )}
                Profile
              </button>
            ) : (
              <button
                className="nav-link"
                onClick={() => configured ? setShowAuth(true) : onTabChange('profile')}
                style={{ fontWeight: 600 }}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <div style={{ flex: 1 }}>
        {children}
      </div>

      {/* Auth modal */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}