import { useState, useMemo } from 'react'
import { usePolling } from '../hooks/usePolling'

interface DiscoursePost {
    id: string
    platform: string
    author: string
    title: string
    content: string
    url: string
    arxiv_id: string
    score: number
    comments: number
    subreddit: string
    influencer: boolean
    created_at: string
}

interface DiscourseFeedProps {
    onPaperClick?: (arxivId: string) => void
}

const PLATFORMS = [
    { key: 'all', label: 'All', icon: '◉' },
    { key: 'reddit', label: 'Reddit', icon: '⟐' },
    { key: 'twitter', label: 'X', icon: '𝕏' },
    { key: 'hackernews', label: 'HN', icon: '▲' },
] as const

type PlatformFilter = typeof PLATFORMS[number]['key']

const PLATFORM_COLORS: Record<string, string> = {
    reddit: '#b87040',
    twitter: '#5a8aaa',
    hackernews: '#b0754a',
}

function timeAgo(dateStr: string): string {
    if (!dateStr) return ''
    const now = Date.now()
    const then = new Date(dateStr).getTime()
    const diff = Math.max(0, now - then)
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    return `${Math.floor(hrs / 24)}d`
}

export function DiscourseFeed({ onPaperClick }: DiscourseFeedProps) {
    const { data: posts } = usePolling<DiscoursePost[]>('/api/discourse', 15000)
    const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all')

    const filtered = useMemo(() => {
        if (!posts) return []
        const f = platformFilter === 'all'
            ? posts
            : posts.filter(p => p.platform === platformFilter)
        return f.slice(0, 15)
    }, [posts, platformFilter])

    return (
        <div className="card discourse-card">
            <div className="card-header">
                <span className="card-title">Live Feed</span>
                <span className="stat-live-dot" title="Live" />
            </div>

            {/* Platform tabs */}
            <div className="discourse-tabs">
                {PLATFORMS.map(p => (
                    <button
                        key={p.key}
                        className={`discourse-tab ${platformFilter === p.key ? 'active' : ''}`}
                        onClick={() => setPlatformFilter(p.key)}
                        style={platformFilter === p.key && p.key !== 'all'
                            ? { borderColor: PLATFORM_COLORS[p.key], color: PLATFORM_COLORS[p.key] }
                            : undefined
                        }
                    >
                        <span className="discourse-tab-icon">{p.icon}</span>
                        {p.label}
                    </button>
                ))}
            </div>

            {/* Compact post list */}
            <div className="discourse-scroll">
                {filtered.length === 0 ? (
                    <div className="discourse-empty">
                        {!posts ? 'Loading…'
                            : platformFilter === 'twitter'
                                ? <><span style={{ fontSize: 16, display: 'block', marginBottom: 6 }}>𝕏</span>Nitter mirrors may be unavailable.<br />X/Twitter posts will appear when a working instance is found.</>
                                : platformFilter === 'all'
                                    ? 'Waiting for discourse data…'
                                    : `No ${platformFilter} posts yet`
                        }
                    </div>
                ) : (
                    filtered.map((post, i) => {
                        const pColor = PLATFORM_COLORS[post.platform] || '#888'
                        return (
                            <div
                                key={post.id}
                                className="discourse-row"
                                onClick={() => {
                                    if (post.arxiv_id && onPaperClick) {
                                        onPaperClick(post.arxiv_id)
                                    } else if (post.url) {
                                        window.open(post.url, '_blank')
                                    }
                                }}
                                style={{ animationDelay: `${i * 30}ms` }}
                            >
                                <span className="discourse-platform-dot" style={{ background: pColor }} />
                                <span className="discourse-row-title">
                                    {post.title || post.content?.slice(0, 60)}
                                </span>
                                <span className="discourse-row-meta">
                                    {post.influencer && <span className="influencer-dot">*</span>}
                                    <span className="discourse-row-score">↑{post.score}</span>
                                    <span className="discourse-row-time">{timeAgo(post.created_at)}</span>
                                </span>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
