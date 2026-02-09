interface Stats {
    papers_total: number
    mentions_total: number
    papers_today: number
    trending_topics: string[]
}

interface StatsPanelProps {
    stats: Stats | null
}

export function StatsPanel({ stats }: StatsPanelProps) {
    return (
        <div className="card">
            <div className="card-header">
                <span className="card-title">System Stats</span>
            </div>
            <div className="stat-grid">
                <div className="stat-box">
                    <div className="stat-value">{stats?.papers_total ?? '—'}</div>
                    <div className="stat-label">Total Papers</div>
                </div>
                <div className="stat-box">
                    <div className="stat-value">{stats?.mentions_total ?? '—'}</div>
                    <div className="stat-label">Mentions</div>
                </div>
                <div className="stat-box">
                    <div className="stat-value">{stats?.papers_today ?? '—'}</div>
                    <div className="stat-label">Today</div>
                </div>
                <div className="stat-box">
                    <div className="stat-value" style={{ color: 'var(--accent-secondary)' }}>
                        {stats?.trending_topics?.length ?? '—'}
                    </div>
                    <div className="stat-label">Topics</div>
                </div>
            </div>
        </div>
    )
}
