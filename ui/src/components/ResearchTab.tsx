/**
 * ResearchTab — Deep Dive generator and available blogs library.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { DeepDive, type DeepDiveData } from './DeepDive'
import { API_BASE_URL } from '../config'
import type { Paper } from '../App'
import { useAuth } from './auth/AuthContext'

interface ResearchTabProps {
  initialPaper?: Paper | null
  onPaperClick: (paper: Paper) => void
}

export function ResearchTab({ initialPaper, onPaperClick }: ResearchTabProps) {
  const { trackPaperView, saveDeepDiveRecord } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Paper[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [deepDiveData, setDeepDiveData] = useState<DeepDiveData | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingPaper, setGeneratingPaper] = useState<Paper | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [availableDives, setAvailableDives] = useState<{ paper_id: string; title: string; generated_at: number; status: string }[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generatedPaperIdRef = useRef<string | null>(null)
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch available deep dives
  const fetchAvailable = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/deep-dive/available`)
      if (resp.ok) {
        const data = await resp.json()
        setAvailableDives(data)
      }
    } catch (e) {
      console.error('Failed to fetch available deep dives:', e)
    }
  }, [])

  useEffect(() => {
    fetchAvailable()
  }, [fetchAvailable, deepDiveData])

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  // Live search with debounce
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    try {
      const resp = await fetch(`${API_BASE_URL}/api/papers/search?q=${encodeURIComponent(q.trim())}`)
      if (resp.ok) {
        const data = await resp.json()
        setSearchResults(data)
      }
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (searchQuery.trim().length >= 2) {
      debounceRef.current = setTimeout(() => doSearch(searchQuery), 350)
    } else {
      setSearchResults([])
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery, doSearch])

  // Polling logic for deep-dive generation
  const pollDeepDive = useCallback((paperId: string) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
    let attempts = 0
    const maxAttempts = 60 // 60 attempts * 3s = 180s (3 minutes)

    pollingIntervalRef.current = setInterval(async () => {
      attempts++
      if (attempts > maxAttempts) {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
        setError('Generation timed out. Please try again.')
        setIsGenerating(false)
        return
      }

      try {
        const resp = await fetch(`${API_BASE_URL}/api/deep-dive/${encodeURIComponent(paperId)}`)
        if (resp.ok) {
          const data = await resp.json()
          // Check if data is complete
          if (data.chapters && data.chapters.length > 0 && data.status !== 'generating') {
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
            setDeepDiveData(data)
            setIsGenerating(false)
            fetchAvailable() // Refresh library
          }
        }
      } catch (e) {
        console.error('Polling failed:', e)
      }
    }, 3000)
  }, [fetchAvailable])

  // Generate deep dive
  const generateDeepDive = async (paper: Paper) => {
    if (paper && paper.id) {
      trackPaperView(paper.id, paper.title)
      saveDeepDiveRecord(paper.id, paper.title)
    }

    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
    setGeneratingPaper(paper)
    setIsGenerating(true)
    setError(null)
    setDeepDiveData(null)

    try {
      const resp = await fetch(`${API_BASE_URL}/api/deep-dive/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paper_id: paper.id,
          title: paper.title,
          abstract: paper.abstract || '',
          authors: paper.authors || [],
          date: paper.date || '',
          tags: paper.tags || [],
        }),
      })
      if (!resp.ok) throw new Error(`Server error ${resp.status}`)
      const data = await resp.json()
      
      if (data.chapters && data.chapters.length > 0 && data.status !== 'generating') {
        setDeepDiveData(data)
        setIsGenerating(false)
      } else if (data.status === 'generating') {
        pollDeepDive(paper.id)
      } else {
        setError('No content generated. Check backend logs.')
        setIsGenerating(false)
      }
    } catch (e: any) {
      setError(e.message || 'Failed to generate deep dive')
      setIsGenerating(false)
    }
  }

  const regenerateDeepDive = async () => {
    if (!deepDiveData) return
    const paper = {
      id: deepDiveData.paper_id,
      title: deepDiveData.title,
      abstract: deepDiveData.abstract || '',
      authors: deepDiveData.authors || [],
      date: deepDiveData.date || '',
      tags: deepDiveData.tags || [],
    }

    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
    setGeneratingPaper(paper as Paper)
    setIsGenerating(true)
    setError(null)
    setDeepDiveData(null)

    try {
      const resp = await fetch(`${API_BASE_URL}/api/deep-dive/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paper_id: paper.id,
          title: paper.title,
          abstract: paper.abstract,
          authors: paper.authors,
          date: paper.date,
          tags: paper.tags,
          force: true,
        }),
      })
      if (!resp.ok) throw new Error(`Server error ${resp.status}`)
      const data = await resp.json()
      
      if (data.chapters && data.chapters.length > 0 && data.status !== 'generating') {
        setDeepDiveData(data)
        setIsGenerating(false)
      } else if (data.status === 'generating') {
        pollDeepDive(paper.id)
      } else {
        setError('No content generated. Check backend logs.')
        setIsGenerating(false)
      }
    } catch (e: any) {
      setError(e.message || 'Failed to regenerate deep dive')
      setIsGenerating(false)
    }
  }

  // Auto-generate if initialPaper was provided and is new
  useEffect(() => {
    if (initialPaper) {
      if (initialPaper.id !== generatedPaperIdRef.current) {
        generatedPaperIdRef.current = initialPaper.id
        generateDeepDive(initialPaper)
      }
    } else {
      generatedPaperIdRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPaper])

  // Filter completed deep dives
  const completedDives = availableDives.filter(d => d.status === 'complete')

  // If we have a deep dive article, show it full-screen
  if (deepDiveData && deepDiveData.chapters && deepDiveData.chapters.length > 0) {
    return (
      <DeepDive
        data={deepDiveData}
        onBack={() => {
          setDeepDiveData(null)
          setGeneratingPaper(null)
        }}
        onRegenerate={regenerateDeepDive}
      />
    )
  }

  return (
    <>
      <div className="page-content" style={{ paddingTop: 24 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px' }}>
            Deep <em>Dives</em>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
            Search for any paper and generate an in-depth article, or read pre-generated ones
          </p>
        </div>

        {/* Search bar — Premium Redesign */}
        <div className="research-search-wrap">
          <div className="premium-search-bar">
            <div className="premium-search-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              type="text"
              className="premium-search-input"
              placeholder="Search papers on arXiv... e.g. 'vision transformer', 'federated learning'"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button
                className="premium-search-clear"
                onClick={() => setSearchQuery('')}
                title="Clear search"
                style={{ marginRight: isSearching ? 8 : 0 }}
              >
                &times;
              </button>
            )}
            {isSearching && <div className="loading-spinner" style={{ width: 16, height: 16 }} />}
          </div>
        </div>

        {/* Generating state */}
        {isGenerating && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 20, maxWidth: 680,
            margin: '40px auto', padding: 24, background: 'var(--bg)',
            border: '1px solid var(--border)', borderRadius: 10
          }}>
            <div className="loading-spinner" />
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>
                Generating deep dive...
              </h3>
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>
                {generatingPaper?.title}
              </p>
              <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: 12 }}>
                Downloading PDF, extracting content, generating analysis...
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            maxWidth: 680, margin: '20px auto', padding: '12px 16px',
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
            color: '#991b1b', fontSize: 14
          }}>
            <strong>Error:</strong> {error}
            <button onClick={() => setError(null)} style={{
              marginLeft: 12, cursor: 'pointer', background: 'none', border: 'none',
              color: '#991b1b', textDecoration: 'underline', fontFamily: 'inherit'
            }}>
              Dismiss
            </button>
          </div>
        )}

        {/* Search results */}
        {searchResults.length > 0 && !isGenerating && (
          <div style={{ maxWidth: 780, margin: '0 auto', padding: '0 20px' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, fontWeight: 500 }}>
              {searchResults.length} results for "{searchQuery}"
            </div>
            {searchResults.map(paper => (
              <article
                key={paper.id}
                className="paper-card"
                onClick={() => onPaperClick(paper)}
                style={{ cursor: 'pointer' }}
              >
                <div className="paper-body">
                  <h3 className="paper-title">{paper.title}</h3>
                  <div className="paper-authors">
                    {paper.authors?.slice(0, 3).join(', ')}
                    {(paper.authors?.length || 0) > 3 && `, +${paper.authors!.length - 3}`}
                    {paper.date && <span style={{ opacity: 0.5 }}> · {paper.date}</span>}
                  </div>
                  {paper.abstract && (
                    <p className="paper-abstract">{paper.abstract.slice(0, 300)}...</p>
                  )}
                  <div className="paper-tags">
                    {paper.tags?.slice(0, 3).map((tag: string) => (
                      <span key={tag} className="paper-tag">
                        <span className="paper-tag-dot" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Available completed deep-dives (latest blogs) */}
        {!isGenerating && searchQuery.trim().length < 2 && completedDives.length > 0 && (
          <div style={{ maxWidth: 780, margin: '32px auto 0', padding: '0 20px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, letterSpacing: '-0.3px' }}>
              Latest Deep Dives (Blogs)
            </h2>
            <div className="research-available-grid">
              {completedDives.map(dive => (
                <div
                  key={dive.paper_id}
                  className="research-available-card"
                  onClick={async () => {
                    setIsGenerating(true)
                    setError(null)
                    try {
                      const resp = await fetch(`${API_BASE_URL}/api/deep-dive/${encodeURIComponent(dive.paper_id)}`)
                      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
                      const data = await resp.json()
                      setDeepDiveData(data)
                      trackPaperView(dive.paper_id, dive.title)
                      saveDeepDiveRecord(dive.paper_id, dive.title)
                    } catch (e: any) {
                      setError(e.message || 'Failed to load deep-dive')
                    } finally {
                      setIsGenerating(false)
                    }
                  }}
                >
                  <div className="research-avail-title">{dive.title}</div>
                  <div className="research-avail-meta">
                    <span>ID: {dive.paper_id}</span>
                    <span> &middot; </span>
                    <span>{new Date(dive.generated_at * 1000).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isGenerating && searchResults.length === 0 && searchQuery.trim().length >= 2 && !error && (
          <div style={{
            textAlign: 'center', marginTop: 60, color: 'var(--text-muted)', fontSize: 14
          }}>
            {isSearching ? 'Searching...' : 'No papers found. Try different keywords.'}
          </div>
        )}

        {/* Home instructions if no search and no blogs */}
        {!isGenerating && searchQuery.trim().length < 2 && completedDives.length === 0 && (
          <div style={{
            textAlign: 'center', marginTop: 60, color: 'var(--text-muted)', fontSize: 14
          }}>
            Type at least 2 characters to search arXiv papers and generate articles.
          </div>
        )}
      </div>
    </>
  )
}