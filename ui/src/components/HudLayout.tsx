/**
 * HudLayout — Top navigation shell and global sidebar layout wrapper.
 */
import { useState, useEffect, type ReactNode } from 'react'
import { useAuth } from './auth/AuthContext'
import { AuthModal } from './auth/AuthModal'
import { StatsPanel } from './StatsPanel'
import type { Paper } from '../App'

export type TabView = 'trending' | 'methods' | 'research' | 'profile' | 'agent'

interface HudLayoutProps {
  activeTab: TabView
  onTabChange: (tab: TabView) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  papers: Paper[]
  stats: any
  onDomainClick: (domain: string) => void
  children: ReactNode
}

export function HudLayout({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  papers,
  stats,
  onDomainClick,
  children,
}: HudLayoutProps) {
  const { user, configured } = useAuth()
  const [showAuth, setShowAuth] = useState(false)

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('saraswati-theme') as 'light' | 'dark') || 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('saraswati-theme', theme)
  }, [theme])

  return (
    <>
      {/* Top bar — uses existing .navbar CSS */}
      <header className="navbar">
        <div className="navbar-inner">
          <div
            className="logo"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              onTabChange('trending')
              onSearchChange('')
            }}
          >
            <div className="logo-icon" />
            <div className="logo-brand">
              <span className="logo-brand-main">saraswati</span>
              <span className="logo-brand-subtitle">r e s e a r c h</span>
            </div>
          </div>

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

          {/* Search (only on trending tab) — Premium redesign */}
          {activeTab === 'trending' && (
            <div className="nav-search-premium-wrap">
              <div className="premium-search-bar">
                <div className="premium-search-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <input
                  type="text"
                  className="premium-search-input"
                  placeholder="Filter papers..."
                  value={searchQuery}
                  onChange={e => onSearchChange(e.target.value)}
                />
                {searchQuery && (
                  <button
                    className="premium-search-clear"
                    onClick={() => onSearchChange('')}
                    title="Clear filter"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Auth indicator — right side */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <button
              className="theme-toggle-btn"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            >
              {theme === 'light' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              )}
            </button>
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

      {/* Global Sidebar Layout (Replicates Papers with Code Left Rail) */}
      <div className="page-layout">
        <StatsPanel
          activeTab={activeTab}
          onTabChange={onTabChange}
          papers={papers}
          activeDomain={searchQuery}
          stats={stats}
          onDomainClick={onDomainClick}
        />
        <main className="page-main">
          {children}
        </main>
      </div>

      {/* Auth modal */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}