import { useEffect, useState } from 'react'

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

const ICONS: Record<string, string> = {
    arxiv: '📄',
    huggingface: '🤗',
    reddit: '🤖',
    twitter: '🐦',
    hackernews: '🟠',
}

function BarChart({ items, maxCount }: { items: BreakdownItem[]; maxCount: number }) {
    return (
        <div className="stat-detail-bars">
            {items.map((item) => (
                <div key={item.name} className="stat-detail-bar-row">
                    <div className="stat-detail-bar-label">
                        <span>{ICONS[item.name.toLowerCase()] || '•'} {item.name}</span>
                        <span className="stat-detail-bar-count">{item.count}</span>
                    </div>
                    <div className="stat-detail-bar-track">
                        <div
                            className="stat-detail-bar-fill"
                            style={{ width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%` }}
                        />
                    </div>
                </div>
            ))}
        </div>
    )
}

export function StatDetailModal({ type, onClose }: StatDetailModalProps) {
    const [data, setData] = useState<StatDetail | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch(`/api/stats/detail?type=${type}`)
            .then((r) => r.json())
            .then((d) => { setData(d); setLoading(false) })
            .catch(() => setLoading(false))
    }, [type])

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
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
            <div className="modal-panel">
                <button className="modal-close" onClick={onClose}>×</button>

                <div className="modal-score">
                    <span className="modal-score-value">{data?.total?.toLocaleString() ?? '—'}</span>
                    <span className="modal-score-label">Total {type}</span>
                </div>

                <h2 className="modal-title">{TITLES[type] || type}</h2>

                {loading ? (
                    <div className="loading"><div className="loading-spinner" /></div>
                ) : (
                    <div className="modal-section">
                        <h3 className="modal-section-title">
                            {type === 'papers' ? 'By Source' : type === 'mentions' ? 'By Platform' : 'Topics'}
                        </h3>
                        <BarChart items={items} maxCount={maxCount} />

                        {type === 'mentions' && data?.with_paper_links !== undefined && (
                            <div className="stat-detail-note">
                                <span className="stat-detail-note-icon">🔗</span>
                                {data.with_paper_links} mentions link to ArXiv papers
                            </div>
                        )}
                    </div>
                )}

                <div className="modal-actions">
                    <button className="modal-btn secondary" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    )
}
