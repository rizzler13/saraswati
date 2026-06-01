import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../config'

interface StatDetailModalProps {
  type: 'papers' | 'mentions' | 'topics'
  onClose: () => void
}

interface BreakdownItem {
  name: string
  count: number
}

interface StatDetail {
  type: string
  total: number
  by_source?: BreakdownItem[]
  by_category?: BreakdownItem[]
  by_platform?: BreakdownItem[]
  with_paper_links?: number
  topics?: BreakdownItem[]
}

const TITLES: Record<string, string> = {
  papers: 'Paper Sources',
  mentions: 'Discourse Mentions',
  topics: 'Topic Distribution',
}

export function StatDetailModal({ type, onClose }: StatDetailModalProps) {
  const [data, setData] = useState<StatDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/stats/detail?type=${type}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [type])

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

  const getItems = (): BreakdownItem[] => {
    if (!data) return []
    if (type === 'papers') return [...(data.by_source || []), ...(data.by_category || [])]
    if (type === 'mentions') return data.by_platform || []
    if (type === 'topics') return data.topics || []
    return []
  }

  const items = getItems()
  const maxCount = items.reduce((m, i) => Math.max(m, i.count), 0)

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-panel" id="stat-detail-modal">
        <button className="modal-close" onClick={onClose}>&times;</button>

        <div className="modal-score">
          {data?.total?.toLocaleString() ?? '--'} total
        </div>

        <h2 className="modal-title">{TITLES[type] || type}</h2>

        {loading ? (
          <div className="empty-state">
            <div className="loading-spinner" />
            Loading...
          </div>
        ) : (
          <div className="stat-bars">
            {items.map(item => (
              <div key={item.name} className="stat-bar-row">
                <div className="stat-bar-label">
                  <span>{item.name}</span>
                  <span className="stat-bar-count">{item.count}</span>
                </div>
                <div className="stat-bar-track">
                  <div
                    className="stat-bar-fill"
                    style={{ width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
