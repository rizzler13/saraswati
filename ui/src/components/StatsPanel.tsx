import { useMemo } from 'react'
import type { Paper } from '../App'

interface DomainSidebarProps {
  papers: Paper[]
  activeDomain?: string
  stats?: {
    trending_topics?: { name: string; count: number; multiplier?: number }[]
    top_domains?: { name: string; count: number }[]
  } | null
  onDomainClick?: (domain: string) => void
}

export function StatsPanel({ papers, activeDomain, stats, onDomainClick }: DomainSidebarProps) {
  const topDomains = useMemo(() => {
    if (stats?.top_domains && stats.top_domains.length > 0) {
      return stats.top_domains.slice(0, 8)
    }
    if (!papers || papers.length === 0) return []
    const counts = new Map<string, number>()
    papers.forEach(p => {
      // Use category first, then first tag
      const domain = p.category || (p as any).tags?.[0] || 'Machine Learning'
      counts.set(domain, (counts.get(domain) || 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [stats, papers])

  // Trending domains: prefer stats from API, fallback to local computation
  const trendingDomains = useMemo(() => {
    // Use API stats if they have valid names
    if (stats?.trending_topics && stats.trending_topics.length > 0) {
      const valid = stats.trending_topics.filter(t => t.name && t.name.trim().length > 0)
      if (valid.length > 0) {
        return valid.slice(0, 8).map(t => ({
          name: t.name,
          multiplier: t.multiplier || Math.round((t.count / Math.max(1, papers.length) * 10 + 1) * 10) / 10,
        }))
      }
    }

    // Fallback: compute from tags
    if (!papers || papers.length === 0) return []
    const tagCounts = new Map<string, number>()
    papers.forEach(p => {
      const tags: string[] = (p as any).tags || []
      tags.slice(0, 2).forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      })
    })
    const avg = Math.max(1, Array.from(tagCounts.values()).reduce((a, b) => a + b, 0) / Math.max(1, tagCounts.size))
    return Array.from(tagCounts.entries())
      .map(([name, count]) => ({
        name,
        multiplier: Math.round(Math.max(1.1, count / avg) * 10) / 10,
      }))
      .sort((a, b) => b.multiplier - a.multiplier)
      .slice(0, 8)
  }, [stats, papers])

  if (topDomains.length === 0) return null

  return (
    <aside className="page-sidebar" id="domain-sidebar">
      <div className="sidebar-section">
        <div className="sidebar-label">Top Domains</div>
        <ul className="sidebar-list">
          {/* All Domains entry to reset the filter */}
          <li
            className={`sidebar-item ${!activeDomain ? 'active' : ''}`}
            onClick={() => onDomainClick?.('')}
          >
            <span className="sidebar-item-name">All Domains</span>
            <span className="sidebar-item-count">{papers.length.toLocaleString()}</span>
          </li>
          {topDomains.map(d => (
            <li
              key={d.name}
              className={`sidebar-item ${activeDomain === d.name ? 'active' : ''}`}
              onClick={() => onDomainClick?.(d.name)}
            >
              <span className="sidebar-item-name">{d.name}</span>
              <span className="sidebar-item-count">{d.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Trending Domains</div>
        <ul className="sidebar-list">
          {trendingDomains.map(d => (
            <li
              key={d.name}
              className={`sidebar-item ${activeDomain === d.name ? 'active' : ''}`}
              onClick={() => onDomainClick?.(d.name)}
            >
              <span className="sidebar-item-name trending">{d.name}</span>
              <span className="sidebar-item-count">{d.multiplier}x</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
