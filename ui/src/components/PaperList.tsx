import { useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE_URL } from '../config'
import type { Paper } from '../App'

interface PaperListProps {
  onPaperClick: (paper: Paper) => void
  searchQuery: string
}

/* Tag dot colors — very subtle, like PwC */
const TAG_COLORS: Record<string, string> = {
  'Language Modeling': '#8b7355',
  'LLM': '#8b7355',
  'Reasoning': '#a0522d',
  'Computer Vision': '#5f7a6a',
  'Vision': '#5f7a6a',
  'NLP': '#6b7d8a',
  'Reinforcement Learning': '#6a7b5f',
  'RL': '#6a7b5f',
  'Diffusion': '#7a6a8a',
  'Agents': '#5a7a7a',
  'Multimodal': '#7a7055',
  'Code': '#555d6e',
  'Robotics': '#5a6a5a',
  'MoE': '#8a6a55',
  'Fine-Tuning': '#6a6a8a',
  'Safety': '#8a5555',
  'Alignment': '#8a5555',
  'Transformers': '#55708a',
  'RAG': '#8a5570',
}

function getTagColor(tag: string): string {
  for (const [key, color] of Object.entries(TAG_COLORS)) {
    if (tag.toLowerCase().includes(key.toLowerCase())) return color
  }
  return '#888888'
}

function guessTags(paper: Paper): string[] {
  const title = paper.title.toLowerCase()
  const cat = paper.category || ''
  const tags: string[] = []

  if (cat.includes('CL') || title.includes('language model') || title.includes('llm')) tags.push('Language Modeling')
  if (cat.includes('CV') || title.includes('vision') || title.includes('image')) tags.push('Computer Vision')
  if (title.includes('diffusion')) tags.push('Diffusion')
  if (title.includes('reinforcement') || title.includes('rlhf')) tags.push('Reinforcement Learning')
  if (title.includes('agent')) tags.push('Agents')
  if (title.includes('reasoning')) tags.push('Reasoning')
  if (title.includes('multimodal')) tags.push('Multimodal')
  if (title.includes('transformer') || title.includes('attention')) tags.push('Transformers')
  if (title.includes('retrieval') || title.includes('rag')) tags.push('RAG')
  if (title.includes('code') || title.includes('codegen')) tags.push('Code')
  if (title.includes('fine-tun') || title.includes('lora')) tags.push('Fine-Tuning')
  if (title.includes('safety') || title.includes('alignment')) tags.push('Safety')
  if (title.includes('robot')) tags.push('Robotics')
  if (title.includes('mixture') || title.includes('moe')) tags.push('MoE')

  return tags.length > 0 ? tags.slice(0, 2) : ['Language Modeling']
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function formatAuthors(authors: string[] | undefined): { text: string; extra: number } {
  if (!authors || authors.length === 0) return { text: '', extra: 0 }
  const shown = authors.slice(0, 3)
  return {
    text: shown.join(', '),
    extra: Math.max(0, authors.length - 3),
  }
}

function formatScore(score: number): string {
  if (score >= 1000) return (score / 1000).toFixed(1) + 'k'
  return String(score)
}

function computeStarsPerHour(paper: Paper): string {
  if (!paper.date || !paper.score) return '0.0'
  try {
    const published = new Date(paper.date).getTime()
    const now = Date.now()
    const hours = Math.max(1, (now - published) / (1000 * 60 * 60))
    return (paper.score / hours).toFixed(1)
  } catch {
    return '0.0'
  }
}

const CATEGORIES_LIST = [
  "Agents",
  "Machine Learning",
  "NLP",
  "Computer Vision",
  "Multi-Agent",
  "Robotics",
  "Sound & Audio",
  "Neural & Evolutionary",
  "Information Retrieval",
  "Human-Computer Interaction",
  "Cryptography & Security",
  "Distributed Computing",
  "Software Engineering",
  "Graphics",
  "Multimedia",
  "Social Networks",
  "Audio & Speech",
  "Image & Video",
  "Signal Processing",
  "Computational Neuroscience",
  "Optimization",
  "Quantum Computing",
  "Data Analysis",
  "LLM",
  "Transformers",
  "Diffusion",
  "Generative AI",
  "Reasoning",
  "Reinforcement Learning",
  "3D Vision",
  "Video AI",
  "Segmentation",
  "Multimodal",
  "RAG",
  "Translation",
  "Speech & Audio",
  "Medical AI",
  "Autonomous Systems",
  "Code",
  "Fine-Tuning",
  "Safety",
  "MoE",
  "Efficient AI",
  "Graph Networks",
  "Federated",
  "Time Series",
  "Neuro-Symbolic"
]

function isCategory(q: string): boolean {
  return CATEGORIES_LIST.some(cat => cat.toLowerCase() === q.toLowerCase());
}

export function PaperList({ onPaperClick, searchQuery }: PaperListProps) {
  const [papers, setPapers] = useState<Paper[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset papers when search query changes
  useEffect(() => {
    setPapers([])
    setPage(1)
    setHasMore(true)
    setError(null)
  }, [searchQuery])

  const fetchPapers = useCallback(async (pageNum: number) => {
    setLoading(true)
    setError(null)
    try {
      let url = `${API_BASE_URL}/api/papers/trending?page=${pageNum}&limit=20`

      const isCat = isCategory(searchQuery)
      if (searchQuery.trim()) {
        if (isCat) {
          url += `&category=${encodeURIComponent(searchQuery.trim())}`
        } else {
          // Free text search
          url = `${API_BASE_URL}/api/papers/search?q=${encodeURIComponent(searchQuery.trim())}`
        }
      }

      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data: Paper[] = await response.json()

      if (searchQuery.trim() && !isCat) {
        // Search results (non-paginated API)
        setPapers(data)
        setHasMore(false)
      } else {
        // Trending or Category paginated API
        if (data.length < 20) {
          setHasMore(false)
        }
        setPapers(prev => {
          const existingIds = new Set(prev.map(p => p.id))
          const newPapers = data.filter(p => !existingIds.has(p.id))
          return [...prev, ...newPapers]
        })
      }
    } catch (e) {
      console.error("Failed to fetch papers:", e)
      setError(e instanceof Error ? e.message : "Failed to load papers")
    } finally {
      setLoading(false)
    }
  }, [searchQuery])

  useEffect(() => {
    fetchPapers(page)
  }, [page, searchQuery, fetchPapers])

  // Poll for papers on startup if empty and no active search filter
  useEffect(() => {
    if (papers.length > 0 || searchQuery.trim() || loading) return

    const interval = setInterval(() => {
      fetchPapers(1)
    }, 5000)

    return () => clearInterval(interval)
  }, [papers.length, searchQuery, loading, fetchPapers])

  // Scroll observer target for infinite scroll
  const observerTarget = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hasMore || loading) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setPage(prev => prev + 1)
        }
      },
      { threshold: 0.1 }
    )

    const target = observerTarget.current
    if (target) {
      observer.observe(target)
    }

    return () => {
      if (target) {
        observer.unobserve(target)
      }
    }
  }, [hasMore, loading])

  // Initial loading/indexing spinner when no papers exist at all on home load
  if (papers.length === 0 && !searchQuery.trim()) {
    return (
      <div className="empty-state" style={{ minHeight: 320, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div className="loading-spinner" style={{ width: 28, height: 28 }} />
        <div style={{ marginTop: 16, fontWeight: 600, color: 'var(--text-primary)', fontSize: 15 }}>
          Initializing trending feed...
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Fetching the latest top papers with code. This may take a moment.
        </div>
      </div>
    )
  }

  if (papers.length === 0 && loading && page === 1) {
    return (
      <div className="empty-state">
        <div className="loading-spinner" />
        Loading papers...
      </div>
    )
  }

  if (error && papers.length === 0) {
    return (
      <div className="empty-state" style={{ color: 'var(--accent-primary)' }}>
        Error loading papers: {error}
      </div>
    )
  }

  if (papers.length === 0 && !loading) {
    return (
      <div className="empty-state">
        No papers found for "{searchQuery}"
      </div>
    )
  }

  return (
    <div id="paper-list">
      {papers.map(paper => {
        const { text: authorsText, extra } = formatAuthors(paper.authors)
        const tags = paper.tags && paper.tags.length > 0 ? paper.tags.slice(0, 2) : guessTags(paper)
        const starsPerHour = computeStarsPerHour(paper)

        return (
          <article
            key={paper.id}
            className="paper-card"
            onClick={() => onPaperClick(paper)}
          >
            {/* Thumbnail — paper first page from backend render */}
            <div className="paper-thumb">
              <img
                src={`${API_BASE_URL}/api/papers/thumbnail/${paper.id}`}
                alt=""
                className="paper-thumb-img"
                loading="lazy"
                onError={(e) => {
                  const img = e.target as HTMLImageElement
                  img.style.display = 'none'
                  const parent = img.parentElement
                  if (parent) {
                    parent.classList.add('paper-thumb-placeholder')
                    parent.setAttribute('data-initial', (paper.category || tags[0] || 'AI')[0].toUpperCase())
                  }
                }}
              />
            </div>

            {/* Body */}
            <div className="paper-body">
              <h3 className="paper-title">{paper.title}</h3>
              <div className="paper-authors">
                {authorsText}
                {extra > 0 && <span className="paper-authors-more">, +{extra} authors</span>}
                {authorsText && <span className="paper-authors-more"> &middot; {formatDate(paper.date)}</span>}
              </div>
              {paper.abstract && (
                <p className="paper-abstract">{paper.abstract}</p>
              )}
              <div className="paper-tags">
                {tags.map(tag => (
                  <span key={tag} className="paper-tag">
                    <span className="paper-tag-dot" style={{ background: getTagColor(tag) }} />
                    {tag}
                  </span>
                ))}

                {/* GitHub Code link */}
                {paper.code_url && (
                  <a
                    href={paper.code_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="paper-code-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="github-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                    <span>Code</span>
                  </a>
                )}
              </div>
            </div>

            {/* Stars column */}
            <div className="paper-stars">
              <div className="paper-star-block">
                <div className="paper-star-value">
                  <svg className="paper-star-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
                  </svg>
                  {formatScore(paper.score)}
                </div>
                <div className="paper-star-label">stars</div>
              </div>
              <div className="paper-star-block">
                <div className="paper-star-value">
                  <svg className="paper-star-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3.47 7.78a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0l4.25 4.25a.751.751 0 01-.018 1.042.751.751 0 01-1.042.018L9 4.81v7.44a.75.75 0 01-1.5 0V4.81L4.53 7.78a.75.75 0 01-1.06 0z"/>
                  </svg>
                  {starsPerHour}
                </div>
                <div className="paper-star-label">stars / hr</div>
              </div>
            </div>
          </article>
        )
      })}

      {hasMore && (
        <div ref={observerTarget} style={{ height: 40, margin: '20px 0', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {loading && <div className="loading-spinner" style={{ width: 24, height: 24 }} />}
        </div>
      )}
    </div>
  )
}
