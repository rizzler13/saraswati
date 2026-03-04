import { useEffect, useRef } from 'react'
import type { Paper } from '../App'

interface PaperDetailModalProps {
    paper: Paper
    onClose: () => void
}

export function PaperDetailModal({ paper, onClose }: PaperDetailModalProps) {
    const panelRef = useRef<HTMLDivElement>(null)

    // Close on Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [onClose])

    // Close on click outside
    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose()
    }

    const arxivUrl = `https://arxiv.org/abs/${paper.id}`

    return (
        <div className="modal-overlay" onClick={handleOverlayClick}>
            <div className="modal-panel" ref={panelRef}>
                <button className="modal-close" onClick={onClose}>×</button>

                <div className="modal-score">
                    <span className="modal-score-value">⬆ {paper.score}</span>
                    <span className="modal-score-label">Hype Score</span>
                </div>

                <h2 className="modal-title">{paper.title}</h2>

                <div className="modal-id">
                    <a href={arxivUrl} target="_blank" rel="noopener noreferrer"
                        className="modal-arxiv-link">
                        {paper.id} ↗
                    </a>
                    <span className="modal-date">{paper.date}</span>
                </div>

                {paper.authors && paper.authors.length > 0 && (
                    <div className="modal-authors">
                        {paper.authors.map((author, i) => (
                            <span key={i} className="modal-author-tag">{author}</span>
                        ))}
                    </div>
                )}

                <div className="modal-section">
                    <h3 className="modal-section-title">Abstract</h3>
                    <p className="modal-abstract">{paper.abstract}</p>
                </div>

                <div className="modal-actions">
                    <a href={arxivUrl} target="_blank" rel="noopener noreferrer"
                        className="modal-btn primary">
                        View on ArXiv
                    </a>
                    <button className="modal-btn secondary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}
