import { useEffect, useRef } from 'react'
import type { Paper } from '../App'

interface PaperDetailModalProps {
  paper: Paper
  onClose: () => void
  onResearch?: (paper: Paper) => void
}

export function PaperDetailModal({
  paper,
  onClose,
  onResearch,
}: PaperDetailModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

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

  const paperUrl = paper.url
    || `https://arxiv.org/abs/${paper.id}`

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-panel" ref={panelRef}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>

        <div className="modal-score">
          <span className="modal-score-value">{paper.score}</span>
          <span className="modal-score-label">score</span>
        </div>

        <h2 className="modal-title">{paper.title}</h2>

        <div className="modal-id">
          <a
            href={paperUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="modal-arxiv-link"
          >
            {paper.id}
          </a>
          <span className="modal-date">{paper.date}</span>
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

        <div className="modal-section">
          <h3 className="modal-section-title">Abstract</h3>
          <p className="modal-abstract">{paper.abstract}</p>
        </div>

        <div className="modal-actions">
          {onResearch && (
            <button
              className="modal-btn research"
              onClick={() => onResearch(paper)}
            >
              Deep Research
            </button>
          )}
          <a
            href={paperUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="modal-btn primary"
          >
            View Paper
          </a>
          <button
            className="modal-btn secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
