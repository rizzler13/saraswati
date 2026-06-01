import { useState, useMemo } from 'react'

interface Mention {
  title: string
  url: string
  platform: string
  score: number
  date: string
  paper_id?: string
}

interface DiscourseFeedProps {
  mentions?: Mention[] | null
}

const PLATFORM_COLORS: Record<string, string> = {
  reddit: '#8b7355',
  hackernews: '#a0522d',
  twitter: '#5a7a7a',
  default: '#999',
}

function timeAgo(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours < 1) return 'now'
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
  } catch {
    return ''
  }
}

export function DiscourseFeed({ mentions }: DiscourseFeedProps) {
  const [platform, setPlatform] = useState<string>('all')

  const platforms = useMemo(() => {
    if (!mentions) return []
    const set = new Set<string>()
    mentions.forEach(m => set.add(m.platform))
    return Array.from(set)
  }, [mentions])

  const filtered = useMemo(() => {
    if (!mentions) return []
    let list = platform === 'all' ? mentions : mentions.filter(m => m.platform === platform)
    return list
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
  }, [mentions, platform])

  if (!mentions || mentions.length === 0) return null

  return (
    <div className="discourse-section">
      <div className="discourse-tabs">
        <button
          className={`discourse-tab ${platform === 'all' ? 'active' : ''}`}
          onClick={() => setPlatform('all')}
        >
          All
        </button>
        {platforms.map(p => (
          <button
            key={p}
            className={`discourse-tab ${platform === p ? 'active' : ''}`}
            onClick={() => setPlatform(p)}
          >
            {p}
          </button>
        ))}
      </div>

      {filtered.map((m, i) => (
        <a
          key={i}
          href={m.url}
          target="_blank"
          rel="noopener noreferrer"
          className="discourse-row"
          style={{ textDecoration: 'none' }}
        >
          <span
            className="discourse-dot"
            style={{ background: PLATFORM_COLORS[m.platform] || PLATFORM_COLORS.default }}
          />
          <span className="discourse-row-title">{m.title}</span>
          <span className="discourse-row-score">{m.score.toLocaleString()}</span>
          <span className="discourse-row-time">{timeAgo(m.date)}</span>
        </a>
      ))}
    </div>
  )
}
