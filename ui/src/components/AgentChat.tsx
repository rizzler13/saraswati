/**
 * AgentChat — Global chatting interface with Saraswati.
 * Allows attaching any paper from arXiv to chat with its context.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { MarkdownMathRenderer } from './viz/KaTeXRenderer'
import { MermaidRenderer } from './viz/MermaidRenderer'
import { API_BASE_URL } from '../config'
import { useAuth, type ChatMessage } from './auth/AuthContext'
import type { Paper } from '../App'

export function AgentChat() {
  const { chats, saveChatMessage, saveAttachedPaper } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [attachedPaper, setAttachedPaper] = useState<Paper | null>(null)
  
  // Search Modal state
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Paper[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Load global chat history from context on mount
  useEffect(() => {
    const matchingChat = chats.find(c => c.paperId === 'global')
    if (matchingChat) {
      setMessages(matchingChat.messages || [])
      setAttachedPaper(matchingChat.attachedPaper || null)
    }
  }, [chats])

  // Search papers on arXiv
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    try {
      const resp = await fetch(`${API_BASE_URL}/api/papers/search?q=${encodeURIComponent(q.trim())}`)
      if (resp.ok) {
        const data = await resp.json()
        setSearchResults(data)
      }
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    if (searchQuery.trim().length >= 2) {
      searchDebounce.current = setTimeout(() => doSearch(searchQuery), 350)
    } else {
      setSearchResults([])
    }
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current) }
  }, [searchQuery, doSearch])

  // Send message to backend agent
  const sendMessage = async () => {
    const queryStr = input.trim()
    if (!queryStr || isLoading) return

    const userMsg: ChatMessage = { role: 'user', content: queryStr, timestamp: Date.now() }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)

    // Save user message to parent document
    saveChatMessage('global', 'Global Session', updatedMessages, attachedPaper)

    try {
      const resp = await fetch(`${API_BASE_URL}/api/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryStr,
          paper_id: attachedPaper ? attachedPaper.id : 'global',
          paper_title: attachedPaper ? attachedPaper.title : 'Global Session',
          paper_abstract: attachedPaper ? attachedPaper.abstract : 'General scientific inquiries.',
          history: updatedMessages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.content || 'No response.',
        agent: data.agent,
        timestamp: Date.now(),
      }
      const finalMessages = [...updatedMessages, assistantMsg]
      setMessages(finalMessages)

      // Save assistant response to parent document
      saveChatMessage('global', 'Global Session', finalMessages)
    } catch (e: any) {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: `Error: ${e.message}. Ensure backend is running.`,
        agent: 'error',
        timestamp: Date.now(),
      }
      const finalMessages = [...updatedMessages, errorMsg]
      setMessages(finalMessages)
      
      saveChatMessage('global', 'Global Session', finalMessages)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Clear global chat history
  const clearChat = async () => {
    if (!window.confirm('Clear conversation history?')) return
    setMessages([])
    saveChatMessage('global', 'Global Session', [])
  }


  // Check for mermaid blocks in content
  const renderContent = (content: string) => {
    const mermaidRegex = /```mermaid\n([\s\S]*?)```/g
    const parts: { type: 'text' | 'mermaid'; value: string }[] = []
    let lastIndex = 0
    let match

    while ((match = mermaidRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', value: content.slice(lastIndex, match.index) })
      }
      parts.push({ type: 'mermaid', value: match[1] })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < content.length) {
      parts.push({ type: 'text', value: content.slice(lastIndex) })
    }

    return parts.map((part, i) => {
      if (part.type === 'mermaid') {
        return <MermaidRenderer key={i} code={part.value} />
      }
      return <MarkdownMathRenderer key={i} text={part.value} />
    })
  }

  return (
    <div className="page-full" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-h) - 56px)' }}>
      {/* Top Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Saraswati <em>Agent</em>
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            General assistant for scientific questions and paper evaluation.
          </p>
        </div>

        {/* Paper attachment area */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {attachedPaper ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 8, fontSize: 13, maxWidth: 360 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={attachedPaper.title}>
                Paper: {attachedPaper.title}
              </span>
              <button 
                onClick={() => {
                  setAttachedPaper(null)
                  saveAttachedPaper('global', null)
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 0 }}
                title="Detach Paper"
              >
                &times;
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, background: 'none',
                border: '1px dashed var(--border)', padding: '6px 12px', borderRadius: 8,
                fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)'
              }}
            >
              <span>+</span> Attach Paper context
            </button>
          )}

          {messages.length > 0 && (
            <button 
              onClick={clearChat}
              style={{ background: 'none', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages viewport */}
      <div 
        ref={scrollRef} 
        style={{
          flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
          gap: 16, padding: '16px 20px', border: '1px solid var(--border)',
          borderRadius: 10, background: 'var(--bg-secondary)', marginBottom: 16
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', margin: 'auto', maxWidth: 440, padding: 20 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
              Talk with Saraswati
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
              Ask anything about machine learning, deep learning, or click the <strong>+ Attach Paper</strong> button to import a specific paper as conversation context.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div 
            key={i} 
            style={{
              maxWidth: '85%', padding: '12px 16px', borderRadius: 10,
              fontSize: 14, lineHeight: 1.6,
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              background: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-primary)',
              color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
              border: msg.role === 'user' ? 'none' : '1px solid var(--border-light)',
              borderBottomRightRadius: msg.role === 'user' ? 3 : 10,
              borderBottomLeftRadius: msg.role === 'assistant' ? 3 : 10,
            }}
          >
            {msg.agent && msg.role === 'assistant' && (
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-primary)', marginBottom: 4, letterSpacing: '0.05em' }}>
                {msg.agent} agent
              </div>
            )}
            <div className="research-msg-content" style={{ color: 'inherit' }}>
              {msg.role === 'assistant' ? renderContent(msg.content) : msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div 
            style={{
              alignSelf: 'flex-start', background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)', padding: '12px 16px',
              borderRadius: 10, borderBottomLeftRadius: 3, maxWidth: '85%'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
              <div className="loading-spinner" style={{ width: 14, height: 14, margin: 0 }} />
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input panel */}
      <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
        <textarea
          style={{
            flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '12px 16px', fontSize: 14, fontFamily: 'var(--font-primary)',
            color: 'var(--text-primary)', resize: 'none', outline: 'none', height: 48, lineHeight: '22px'
          }}
          placeholder="Ask a scientific query..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          style={{
            background: 'var(--accent-primary)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '0 20px', fontSize: 15, fontWeight: 600,
            cursor: 'pointer', opacity: (isLoading || !input.trim()) ? 0.5 : 1
          }}
        >
          Send
        </button>
      </div>

      {/* Search and Attach Modal */}
      {showSearch && (
        <div className="modal-overlay" onClick={() => setShowSearch(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <button className="modal-close" onClick={() => setShowSearch(false)}>&times;</button>
            <h2 className="modal-title" style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
              Attach Paper context from arXiv
            </h2>
            
            {/* Search Input */}
            <div style={{ position: 'relative', marginBottom: 20 }}>
              <input
                type="text"
                placeholder="Search by title, keyword, or exact arXiv ID (e.g. 1706.03762)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', border: '1px solid var(--border)',
                  borderRadius: 8, fontSize: 14, outline: 'none'
                }}
                autoFocus
              />
              {isSearching && (
                <div className="loading-spinner" style={{ width: 16, height: 16, position: 'absolute', right: 14, top: 12 }} />
              )}
            </div>

            {/* Results */}
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {searchResults.map(paper => (
                <div
                  key={paper.id}
                  onClick={() => {
                    setAttachedPaper(paper)
                    setShowSearch(false)
                    setSearchQuery('')
                    setSearchResults([])
                    saveAttachedPaper('global', paper)
                  }}
                  style={{
                    padding: 12, border: '1px solid var(--border-light)', borderRadius: 6,
                    cursor: 'pointer', transition: 'background 0.1s'
                  }}
                  className="research-available-card"
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {paper.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {paper.authors?.slice(0, 3).join(', ')} &middot; arXiv: {paper.id}
                  </div>
                </div>
              ))}
              {!isSearching && searchResults.length === 0 && searchQuery.trim().length >= 2 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, fontSize: 13 }}>
                  No papers found. Try different keywords or an exact arXiv ID.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
