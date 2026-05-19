import { useState, useMemo } from 'react'
import type { Paper } from '../App'

interface PaperListProps {
  papers: Paper[]
  isLoading: boolean
  onPaperClick?: (paper: Paper) => void
  selectedPaperId?: string | null
}

const FILTER_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'llm', label: 'LLM' },
  { key: 'vision', label: 'Vision' },
  { key: 'nlp', label: 'NLP' },
  { key: 'rl', label: 'RL' },
  { key: 'diffusion', label: 'Diffusion' },
  { key: 'agents', label: 'Agents' },
  { key: 'multimodal', label: 'Multi' },
  { key: 'code', label: 'Code' },
] as const

type FilterKey = typeof FILTER_CATEGORIES[number]['key']
type SortMode = 'score' | 'date' | 'discussed'

function matchesFilter(paper: Paper, filter: FilterKey): boolean {
  if (filter === 'all') return true
  const text = (paper.title + ' ' + (paper.abstract || '')).toLowerCase()
  const cat = ((paper as any).category || '').toLowerCase()

  switch (filter) {
    case 'llm':
      return text.includes('language model')
        || text.includes('llm')
        || text.includes('gpt')
        || cat.includes('cl')
    case 'vision':
      return text.includes('vision')
        || text.includes('image')
        || text.includes('visual')
        || cat.includes('cv')
    case 'nlp':
      return text.includes('natural language')
        || text.includes('text')
        || text.includes('sentiment')
        || text.includes('translation')
    case 'rl':
      return text.includes('reinforcement')
        || text.includes('rlhf')
        || text.includes('reward')
    case 'diffusion':
      return text.includes('diffusion')
        || text.includes('stable')
        || text.includes('denoising')
    case 'agents':
      return text.includes('agent')
        || text.includes('tool use')
        || text.includes('function call')
    case 'multimodal':
      return text.includes('multimodal')
        || text.includes('vision-language')
        || text.includes('clip')
    case 'code':
      return text.includes('code')
        || text.includes('program')
        || text.includes('codegen')
    default:
      return true
  }
}

function sortPapers(papers: Paper[], mode: SortMode): Paper[] {
  return [...papers].sort((a, b) => {
    switch (mode) {
      case 'score': return b.score - a.score
      case 'date': return b.date.localeCompare(a.date)
      case 'discussed': return b.score - a.score
      default: return 0
    }
  })
}

export function PaperList({
  papers,
  isLoading,
  onPaperClick,
  selectedPaperId,
}: PaperListProps) {
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

      <div className="filter-chips">
        {FILTER_CATEGORIES.map(cat => (
          <button
            key={cat.key}
            className={`filter-chip ${activeFilter === cat.key ? 'active' : ''}`}
            onClick={() => setActiveFilter(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>

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
                className={`paper-item ${selectedPaperId === paper.id ? 'selected' : ''}`}
                onClick={() => onPaperClick?.(paper)}
                style={{ animationDelay: `${Math.min(i * 15, 200)}ms` }}
              >
                <div className="paper-title">{paper.title}</div>
                <div className="paper-meta">
                  <span className="paper-source-tag">
                    {paper.source || 'arxiv'}
                  </span>
                  <span>{paper.date}</span>
                  <span className="paper-score">{paper.score}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
