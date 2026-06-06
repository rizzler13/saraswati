import { useEffect, useRef } from 'react'
import type { Paper } from '../App'
import { useAuth } from './auth/AuthContext'

interface PaperDetailModalProps {
  paper: Paper
  onClose: () => void
  onResearch?: (paper: Paper) => void
  onDeepResearch?: (paper: Paper) => void
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

export function PaperDetailModal({
  paper,
  onClose,
  onResearch,
  onDeepResearch,
}: PaperDetailModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { trackPaperView } = useAuth()

  useEffect(() => {
    if (paper && paper.id) {
      trackPaperView(paper.id, paper.title)
    }
  }, [paper, trackPaperView])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  const paperUrl = paper.url || `https://arxiv.org/abs/${paper.id}`
  const pdfUrl = `https://arxiv.org/pdf/${paper.id}`

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-panel" ref={panelRef} id="paper-detail-modal">
        <button className="modal-close" onClick={onClose} id="modal-close">
          &times;
        </button>

        <div className="modal-score">{paper.score} stars</div>

        <h2 className="modal-title">{paper.title}</h2>

        <div className="modal-meta">
          <a
            href={paperUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="modal-arxiv-link"
          >
            {paper.id}
          </a>
          <span>{formatDate(paper.date)}</span>
          <span>{paper.source || 'arxiv'}</span>
        </div>

        {paper.authors && paper.authors.length > 0 && (
          <div className="modal-authors">
            {paper.authors.map((author, i) => (
              <span key={i} className="modal-author-tag">
                {author}
              </span>
            ))}
          </div>
        )}

        <div className="modal-section-label">Abstract</div>
        <p className="modal-abstract">{paper.abstract}</p>

        <div className="modal-actions">
          {onDeepResearch && (
            <button
              className="btn btn-outline"
              onClick={() => onDeepResearch(paper)}
              id="btn-deep-dive"
            >
              Deep Dive
            </button>
          )}
          {onResearch && (
            <button
              className="btn btn-outline"
              onClick={() => onResearch(paper)}
              id="btn-deep-research"
            >
              Chat with Paper
            </button>
          )}
          <a
            href={paperUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
          >
            View Paper
          </a>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
          >
            PDF
          </a>
          <button
            className="btn btn-outline"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
