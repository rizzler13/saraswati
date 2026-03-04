import { useState, useMemo } from 'react'
import type { Paper } from '../App'

interface PaperListProps {
    papers: Paper[]
    isLoading: boolean
    onPaperClick?: (paper: Paper) => void
    selectedPaperId?: string | null
}
const FILTER_CATEGORIES = [
    { key: 'all', label: 'All', icon: '◉' },
    { key: 'llm', label: 'LLM', icon: '🧠' },
    { key: 'vision', label: 'Vision', icon: '👁' },
    { key: 'nlp', label: 'NLP', icon: '💬' },
    { key: 'rl', label: 'RL', icon: '🎮' },
    { key: 'diffusion', label: 'Diffusion', icon: '🎨' },
    { key: 'agents', label: 'Agents', icon: '🤖' },
    { key: 'multimodal', label: 'Multi', icon: '🔗' },
    { key: 'code', label: 'Code', icon: '⌨' },
] as const

type FilterKey = typeof FILTER_CATEGORIES[number]['key']
type SortMode = 'score' | 'date' | 'discussed'

function matchesFilter(paper: Paper, filter: FilterKey): boolean {
    if (filter === 'all') return true
    const t = (paper.title + ' ' + (paper.abstract || '')).toLowerCase()
    const cat = ((paper as any).category || '').toLowerCase()
    switch (filter) {
        case 'llm': return t.includes('language model') || t.includes('llm') || t.includes('gpt') || cat.includes('cl')
        case 'vision': return t.includes('vision') || t.includes('image') || t.includes('visual') || cat.includes('cv')
        case 'nlp': return t.includes('natural language') || t.includes('text') || t.includes('sentiment') || t.includes('translation')
        case 'rl': return t.includes('reinforcement') || t.includes('rlhf') || t.includes('reward')
        case 'diffusion': return t.includes('diffusion') || t.includes('stable') || t.includes('denoising')
        case 'agents': return t.includes('agent') || t.includes('tool use') || t.includes('function call')
        case 'multimodal': return t.includes('multimodal') || t.includes('vision-language') || t.includes('clip')
        case 'code': return t.includes('code') || t.includes('program') || t.includes('codegen')
        default: return true
    }
}

function sortPapers(papers: Paper[], mode: SortMode): Paper[] {
    return [...papers].sort((a, b) => {
        switch (mode) {
            case 'score': return b.score - a.score
            case 'date': return b.date.localeCompare(a.date)
            case 'discussed': return b.score - a.score // score approximates discussion level
            default: return 0
        }
    })
}
export function PaperList({ papers, isLoading, onPaperClick, selectedPaperId }: PaperListProps) {
    const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
    const [sortMode, setSortMode] = useState<SortMode>('score')

    const filtered = useMemo(() => {
        const f = papers.filter(p => matchesFilter(p, activeFilter))
        return sortPapers(f, sortMode)
    }, [papers, activeFilter, sortMode])

    return (
        <div className="card paper-list-card">
            <div className="card-header">
                <span className="card-title">Papers</span>
                <span className="paper-count-badge">
                    {filtered.length} of {papers.length}
                </span>
            </div>

            {/* Filter Chips */}
            <div className="filter-chips">
                {FILTER_CATEGORIES.map(cat => (
                    <button
                        key={cat.key}
                        className={`filter-chip ${activeFilter === cat.key ? 'active' : ''}`}
                        onClick={() => setActiveFilter(cat.key)}
                    >
                        <span className="filter-chip-icon">{cat.icon}</span>
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Sort Bar */}
            <div className="sort-bar">
                {([
                    { key: 'score' as SortMode, label: 'Top Scored' },
                    { key: 'date' as SortMode, label: 'Recent' },
                    { key: 'discussed' as SortMode, label: 'Discussed' },
                ]).map(s => (
                    <button
                        key={s.key}
                        className={`sort-btn ${sortMode === s.key ? 'active' : ''}`}
                        onClick={() => setSortMode(s.key)}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            {/* Paper items */}
            {isLoading && papers.length === 0 ? (
                <div className="loading">
                    <div className="loading-spinner" />
                </div>
            ) : (
                <div className="paper-scroll">
                    {filtered.length === 0 ? (
                        <div className="paper-empty">No papers match this filter</div>
                    ) : (
                        filtered.slice(0, 50).map((paper, i) => (
                            <div
                                key={paper.id}
                                className={`paper-item paper-item-animated ${selectedPaperId === paper.id ? 'selected' : ''}`}
                                onClick={() => onPaperClick?.(paper)}
                                style={{
                                    transitionDelay: `${Math.min(i * 15, 200)}ms`
                                }}
                            >
                                <div className="paper-title">{paper.title}</div>
                                <div className="paper-meta">
                                    <span className="paper-source-tag">{paper.source || 'arxiv'}</span>
                                    <span>{paper.date}</span>
                                    <span className="paper-score">⬆ {paper.score}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
