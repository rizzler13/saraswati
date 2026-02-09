interface Paper {
    id: string
    title: string
    abstract: string
    date: string
    score: number
}

interface PaperListProps {
    papers: Paper[]
    isLoading: boolean
}

export function PaperList({ papers, isLoading }: PaperListProps) {
    if (isLoading) {
        return (
            <div className="card">
                <div className="card-header">
                    <span className="card-title">Trending Papers</span>
                </div>
                <div className="loading">
                    <div className="loading-spinner" />
                </div>
            </div>
        )
    }

    return (
        <div className="card">
            <div className="card-header">
                <span className="card-title">Trending Papers</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {papers.length} papers
                </span>
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {papers.map((paper) => (
                    <div key={paper.id} className="paper-item">
                        <div className="paper-title">{paper.title}</div>
                        <div className="paper-meta">
                            <span>{paper.id}</span>
                            <span>{paper.date}</span>
                            <span className="paper-score">⬆ {paper.score}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
