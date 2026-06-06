import { useMemo } from 'react'
import type { Paper } from '../App'

interface DomainSidebarProps {
  papers: Paper[]
  activeDomain?: string
  stats?: {
    trending_topics?: { name: string; count: number; multiplier?: number }[]
    top_domains?: { name: string; count: number }[]
    total_papers?: number
  } | null
  onDomainClick?: (domain: string) => void
  activeTab?: string
  onTabChange?: (tab: any) => void
}

export function StatsPanel({
  papers = [],
  activeDomain,
  stats,
  onDomainClick
}: DomainSidebarProps) {
  // Top domains: Select 15 prominent broad categories for homepage/sidebar
  const topDomains = useMemo(() => {
    const baseline = [
      { name: "LLM", count: 34086 },
      { name: "Generative AI", count: 18942 },
      { name: "Reinforcement Learning", count: 5983 },
      { name: "Reasoning", count: 3123 },
      { name: "Transformers", count: 9739 },
      { name: "Diffusion", count: 8261 },
      { name: "Agents", count: 4891 },
      { name: "Multimodal", count: 6799 },
      { name: "Computer Vision", count: 21315 },
      { name: "NLP", count: 17894 },
      { name: "Robotics", count: 2505 },
      { name: "Audio & Speech", count: 2114 },
      { name: "Optimization", count: 3994 },
      { name: "Efficient AI", count: 1574 },
      { name: "Graph Networks", count: 1109 }
    ]

    if (stats?.top_domains && stats.top_domains.length > 0) {
      const statsMap = new Map(stats.top_domains.map((d: any) => [d.name.toLowerCase(), d.count]))
      return baseline.map(b => ({
        name: b.name,
        count: statsMap.get(b.name.toLowerCase()) || b.count
      }))
    }

    if (papers && papers.length > 0) {
      const counts = new Map<string, number>()
      papers.forEach(p => {
        const domain = p.category || (p as any).tags?.[0]
        if (domain) {
          counts.set(domain.toLowerCase(), (counts.get(domain.toLowerCase()) || 0) + 1)
        }
      })
      return baseline.map(b => ({
        name: b.name,
        count: (counts.get(b.name.toLowerCase()) || 0) * 10 + b.count
      }))
    }

    return baseline
  }, [stats, papers])

  // Trending domains: specific hot topics, filtered to avoid overlapping Top Domains
  const trendingDomains = useMemo(() => {
    const topNames = new Set(topDomains.map(d => d.name.toLowerCase()))
    
    const baselineTrending = [
      { name: "Omni Models", multiplier: 3.6 },
      { name: "World Models", multiplier: 2.3 },
      { name: "Computer Use", multiplier: 2.0 },
      { name: "Video Generation", multiplier: 1.8 },
      { name: "RAG", multiplier: 1.5 },
      { name: "Text-to-Speech", multiplier: 1.4 },
      { name: "Fine-Tuning", multiplier: 1.3 },
      { name: "Coding Agents", multiplier: 1.3 },
      { name: "Test-time compute", multiplier: 1.2 }
    ]

    let candidates: { name: string; multiplier: number }[] = []

    if (stats?.trending_topics && stats.trending_topics.length > 0) {
      const valid = stats.trending_topics.filter(t => t.name && t.name.trim().length > 0)
      candidates = valid.map(t => ({
        name: t.name,
        multiplier: t.multiplier || 1.2
      }))
    } else if (papers && papers.length > 0) {
      const tagCounts = new Map<string, number>()
      papers.forEach(p => {
        const tags: string[] = (p as any).tags || []
        tags.slice(0, 2).forEach(tag => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
        })
      })
      const avg = Math.max(1, Array.from(tagCounts.values()).reduce((a, b) => a + b, 0) / Math.max(1, tagCounts.size))
      candidates = Array.from(tagCounts.entries())
        .map(([name, count]) => ({
          name,
          multiplier: Math.round(Math.max(1.1, count / avg) * 10) / 10
        }))
    }

    // Filter to exclude any Top Domain names
    const filtered = candidates.filter(c => !topNames.has(c.name.toLowerCase()))

    const result = filtered
      .sort((a, b) => b.multiplier - a.multiplier)
      .slice(0, 8)

    // Backfill with distinct trending baselines if short
    if (result.length < 5) {
      const resultNames = new Set(result.map(r => r.name.toLowerCase()))
      baselineTrending.forEach(b => {
        if (!topNames.has(b.name.toLowerCase()) && !resultNames.has(b.name.toLowerCase()) && result.length < 8) {
          result.push(b)
        }
      })
    }

    return result
  }, [stats, papers, topDomains])

  return (
    <aside className="page-sidebar" id="domain-sidebar">


      {/* Top Domains Section */}
      <div className="sidebar-section">
        <div className="sidebar-label">Top Domains</div>
        <ul className="sidebar-list">
          {/* All Domains entry to reset the filter */}
          <li
            className={`sidebar-item ${!activeDomain ? 'active' : ''}`}
            onClick={() => onDomainClick?.('')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, opacity: 0.7 }}>
              <rect x="3" y="3" width="7" height="9"></rect>
              <rect x="14" y="3" width="7" height="5"></rect>
              <rect x="14" y="12" width="7" height="9"></rect>
              <rect x="3" y="16" width="7" height="5"></rect>
            </svg>
            <span className="sidebar-item-name">All Domains</span>
          </li>
          {topDomains.map(d => (
            <li
              key={d.name}
              className={`sidebar-item ${activeDomain?.toLowerCase() === d.name.toLowerCase() ? 'active' : ''}`}
              onClick={() => onDomainClick?.(d.name)}
            >
              <span className="sidebar-item-name">{d.name}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Trending Domains Section */}
      <div className="sidebar-section">
        <div className="sidebar-label">Trending Domains</div>
        <ul className="sidebar-list">
          {trendingDomains.map(d => (
            <li
              key={d.name}
              className={`sidebar-item ${activeDomain?.toLowerCase() === d.name.toLowerCase() ? 'active' : ''}`}
              onClick={() => onDomainClick?.(d.name)}
            >
              <span className="sidebar-item-name trending">{d.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
