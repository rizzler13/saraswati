/**
 * ResearchPanel — Chat interface for talking with a paper.
 * Slide-out panel with conversation history.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { MarkdownMathRenderer } from './viz/KaTeXRenderer'
import { MermaidRenderer } from './viz/MermaidRenderer'
import { API_BASE_URL } from '../config'
import type { Paper } from '../App'
import { useAuth, type ChatMessage } from './auth/AuthContext'

interface ResearchPanelProps {
  paper: Paper
  allPapers: Paper[]
  onClose: () => void
}

export function ResearchPanel({ paper, onClose }: ResearchPanelProps) {
  const { chats, saveChatMessage } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [width, setWidth] = useState(480)
  const [isExpanded, setIsExpanded] = useState(false)
  
  const scrollRef = useRef<HTMLDivElement>(null)
  const isResizing = useRef(false)

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Load chat history from AuthContext
  useEffect(() => {
    const matchingChat = chats.find(c => c.paperId === paper.id)
    setMessages(matchingChat ? matchingChat.messages : [])
  }, [paper.id, chats])

  // Toggle expansion
  const toggleExpand = () => {
    setIsExpanded(prev => {
      const next = !prev
      setWidth(next ? 850 : 480)
      return next
    })
  }

  // Resizing logic
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return
    const newWidth = window.innerWidth - e.clientX
    if (newWidth > 320 && newWidth < window.innerWidth * 0.95) {
      setWidth(newWidth)
      setIsExpanded(newWidth > 640)
    }
  }, [])

  const stopResizing = useCallback(() => {
    isResizing.current = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', stopResizing)
  }, [handleMouseMove])

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', stopResizing)
  }

  // Cleanup event listeners
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', stopResizing)
    }
  }, [handleMouseMove, stopResizing])

  const sendMessage = async () => {
    const query = input.trim()
    if (!query || isLoading) return

    const userMsg: ChatMessage = { role: 'user', content: query, timestamp: Date.now() }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)

    // Save user message to parent document
    saveChatMessage(paper.id, paper.title, updatedMessages)

    try {
      const resp = await fetch(`${API_BASE_URL}/api/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          paper_id: paper.id,
          paper_title: paper.title,
          paper_abstract: paper.abstract,
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
      saveChatMessage(paper.id, paper.title, finalMessages)

    } catch (e: any) {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: `Error: ${e.message}. Check that the backend is running and API keys are configured.`,
        agent: 'error',
        timestamp: Date.now(),
      }
      const finalMessages = [...updatedMessages, errorMsg]
      setMessages(finalMessages)

      saveChatMessage(paper.id, paper.title, finalMessages)
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
    <div className="research-panel-overlay" onClick={onClose}>
      <div 
        className={`research-panel ${isExpanded ? 'expanded' : ''}`} 
        style={{ width: `${width}px` }} 
        onClick={e => e.stopPropagation()}
      >
        {/* Resize Handle on the left border */}
        <div 
          className="research-panel-resize-handle" 
          onMouseDown={startResizing}
          onDoubleClick={toggleExpand}
          title="Drag to resize, double-click to toggle width"
        />

        {/* Header */}
        <div className="research-panel-header">
          <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
            <h3 className="research-panel-title">Chat with Paper</h3>
            <p className="research-panel-paper" title={paper.title}>{paper.title}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <button 
              className="research-panel-expand-btn" 
              onClick={toggleExpand}
              title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
            <button className="research-panel-close" onClick={onClose}>×</button>
          </div>
        </div>

        {/* Messages */}
        <div className="research-panel-messages" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="research-panel-welcome">
              <p>Ask anything about this paper:</p>
              <div className="research-panel-suggestions">
                {[
                  'Summarize the key contributions',
                  'Explain the main equation',
                  'What are the limitations?',
                  'Draw the architecture diagram',
                ].map(q => (
                  <button key={q} className="research-panel-suggestion" onClick={() => { setInput(q); }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`research-msg research-msg-${msg.role}`}>
              {msg.agent && msg.role === 'assistant' && (
                <div className="research-msg-agent">{msg.agent} agent</div>
              )}
              <div className="research-msg-content">
                {msg.role === 'assistant' ? renderContent(msg.content) : msg.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="research-msg research-msg-assistant">
              <div className="research-msg-loading">
                <div className="loading-spinner" style={{ width: 16, height: 16 }} />
                Thinking...
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="research-panel-input-wrap">
          <textarea
            className="research-panel-input"
            placeholder="Ask about this paper..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />
          <button
            className="research-panel-send"
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}