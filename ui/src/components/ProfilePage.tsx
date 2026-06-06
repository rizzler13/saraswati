/**
 * ProfilePage — User profile with saved deep dives and chat sessions history.
 */
import { useAuth } from './auth/AuthContext'

interface ProfilePageProps {
  onOpenChat: (paper: { id: string; title: string }) => void
  onOpenDeepDive: (paper: { id: string; title: string }) => void
}

export function ProfilePage({ onOpenChat, onOpenDeepDive }: ProfilePageProps) {
  const { user, logout, configured, chats, deepDives, loading } = useAuth()

  // Filter out empty global chat and sort in JS
  const paperChats = [...chats]
    .filter(chat => chat.paperId !== 'global' || (chat.messages && chat.messages.length > 0))
    .sort((a, b) => b.updatedAt - a.updatedAt)

  const sortedDives = [...deepDives]
    .sort((a, b) => b.updatedAt - a.updatedAt)

  if (!configured) {
    return (
      <div className="page-full">
        <div className="methods-header">
          <h1 className="methods-title">Profile</h1>
          <p className="methods-subtitle">
            Firebase is not configured. Add VITE_FIREBASE_* env vars to enable auth.
          </p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="page-full" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="methods-header" style={{ textAlign: 'center' }}>
          <h1 className="methods-title" style={{ fontSize: 32, marginBottom: 12 }}>Your <em>Profile</em></h1>
          <p className="methods-subtitle" style={{ fontSize: 16 }}>
            Sign in to view your research history and agent sessions.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-full" style={{ paddingBottom: 60 }}>
      {/* Account Header */}
      <div className="methods-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 className="methods-title" style={{ fontSize: 32 }}>Your <em>Profile</em></h1>
          <p className="methods-subtitle" style={{ margin: '4px 0 0' }}>
            Manage your saved literature analyses and chatbot logs
          </p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
              {user.displayName || 'Researcher'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {user.email}
            </div>
          </div>
          <button className="profile-logout-btn" onClick={logout}>
            Sign Out
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div className="loading-spinner" />
        </div>
      ) : (
        <div className="profile-history-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          
          {/* Column 1: Deep Research History */}
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Deep Research Articles</span>
              <span style={{ fontSize: 12, background: 'var(--bg-tag)', padding: '2px 8px', borderRadius: 10, fontWeight: 500, color: 'var(--text-secondary)' }}>
                {sortedDives.length}
              </span>
            </h2>
            
            {sortedDives.length === 0 ? (
              <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                <p style={{ margin: 0, fontSize: 14 }}>No deep research articles generated yet.</p>
                <p style={{ margin: '4px 0 0', fontSize: 12 }}>Search papers and click "Deep Dive" to create one.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sortedDives.map(dive => (
                  <div
                    key={dive.paperId}
                    className="research-available-card"
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', padding: 16, border: '1px solid var(--border)', borderRadius: 8, transition: 'all 0.15s' }}
                    onClick={() => onOpenDeepDive({ id: dive.paperId, title: dive.paperTitle })}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.4 }}>
                      {dive.paperTitle}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>arXiv: {dive.paperId}</span>
                      <span>{new Date(dive.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column 2: Agent Chat Sessions */}
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Agent Chat Sessions</span>
              <span style={{ fontSize: 12, background: 'var(--bg-tag)', padding: '2px 8px', borderRadius: 10, fontWeight: 500, color: 'var(--text-secondary)' }}>
                {paperChats.length}
              </span>
            </h2>

            {paperChats.length === 0 ? (
              <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                <p style={{ margin: 0, fontSize: 14 }}>No conversation history found.</p>
                <p style={{ margin: '4px 0 0', fontSize: 12 }}>Open a paper and click "Chat with Paper" to begin.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {paperChats.map(chat => (
                  <div
                    key={chat.paperId}
                    className="research-available-card"
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', padding: 16, border: '1px solid var(--border)', borderRadius: 8, transition: 'all 0.15s' }}
                    onClick={() => onOpenChat({ id: chat.paperId, title: chat.paperTitle })}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.4 }}>
                      {chat.paperId === 'global' ? 'General Agent Chat' : chat.paperTitle}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>{chat.paperId === 'global' ? 'General Inquiry' : `arXiv: ${chat.paperId}`}</span>
                      <span>{new Date(chat.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}