import { useState, useRef, useEffect } from 'react'
import type { Paper } from '../App'
import {
  buildSystemPrompt,
  buildContextBlock,
  getSuggestedPrompts,
  findRelatedPapers,
  type ResearchMessage,
} from '../lib/research'

interface ResearchPanelProps {
  paper: Paper
  allPapers: Paper[]
  onClose: () => void
}

export function ResearchPanel({
  paper,
  allPapers,
  onClose,
}: ResearchPanelProps) {
  const [messages, setMessages] = useState<ResearchMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const related = findRelatedPapers(paper, allPapers)
  const prompts = getSuggestedPrompts(paper)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  async function sendMessage(query: string) {
    if (!query.trim() || loading) return

    const userMsg: ResearchMessage = { role: 'user', content: query }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setInput('')
    setLoading(true)

    try {
      const context = buildContextBlock(paper, related)
      const system = buildSystemPrompt()

      const chatMessages = [
        { role: 'system', content: system + '\n\n' + context },
        ...updated.map(m => ({ role: m.role, content: m.content })),
      ]

      const res = await fetch('/.netlify/functions/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatMessages }),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(err || `HTTP ${res.status}`)
      }

      const data = await res.json()
      const reply = data.content || 'No response received.'

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: reply },
      ])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed'
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${msg}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div
      className="research-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="research-panel">
        <div className="research-header">
          <span className="research-header-title">
            Deep Research
          </span>
          <button className="research-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="research-context">
          <div className="research-context-title">
            {paper.title}
          </div>
          <div className="research-context-meta">
            {paper.source || 'arxiv'} · {paper.date}
            {paper.authors?.length
              ? ` · ${paper.authors.slice(0, 3).join(', ')}`
              : ''}
          </div>
        </div>

        <div className="research-messages" ref={scrollRef}>
          {messages.length === 0 && !loading && (
            <div className="research-msg" style={{ color: 'var(--text-muted)' }}>
              Ask a question about this paper, or pick a
              suggested prompt below.
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`research-msg ${msg.role}`}>
              <RenderMarkdown text={msg.content} />
            </div>
          ))}

          {loading && (
            <div className="research-loading">
              <span className="research-loading-dot" />
              <span className="research-loading-dot"
                style={{ animationDelay: '0.2s' }} />
              <span className="research-loading-dot"
                style={{ animationDelay: '0.4s' }} />
              <span>Researching...</span>
            </div>
          )}
        </div>

        {messages.length === 0 && !loading && (
          <div className="research-prompts">
            {prompts.map((p, i) => (
              <button
                key={i}
                className="research-prompt-btn"
                onClick={() => sendMessage(p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="research-input-bar">
          <input
            className="research-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this paper..."
            disabled={loading}
          />
          <button
            className="research-send"
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

function RenderMarkdown({ text }: { text: string }) {
  const html = simpleMarkdown(text)
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

function simpleMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // inline code
  html = html.replace(/`(.+?)`/g, '<code>$1</code>')

  // unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

  // paragraphs
  html = html.replace(/\n\n/g, '</p><p>')
  html = '<p>' + html + '</p>'
  html = html.replace(/<p>\s*<(h[123]|ul|ol)/g, '<$1')
  html = html.replace(/<\/(h[123]|ul|ol)>\s*<\/p>/g, '</$1>')

  return html
}
