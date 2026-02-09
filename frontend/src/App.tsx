import { useState, useEffect } from 'react'
import { HudLayout } from './components/HudLayout'
import { PaperList } from './components/PaperList'
import { StatsPanel } from './components/StatsPanel'
import { GraphView } from './components/GraphView'
import { usePolling } from './hooks/usePolling'

interface Paper {
    id: string
    title: string
    abstract: string
    date: string
    score: number
}

interface Stats {
    papers_total: number
    mentions_total: number
    papers_today: number
    trending_topics: string[]
}

interface CrawlerStatus {
    paused: boolean
    papers_ingested: number
    memory_usage_mb: number
}

export default function App() {
    const { data: papers, isLoading: papersLoading } = usePolling<Paper[]>(
        '/api/papers/trending',
        10000
    )

    const { data: stats } = usePolling<Stats>('/api/stats', 30000)
    const { data: crawlerStatus } = usePolling<CrawlerStatus>('/api/crawler/status', 5000)

    return (
        <HudLayout
            crawlerStatus={crawlerStatus}
            header={
                <div className="status-bar">
                    <div className="status-item">
                        <span className={`status-dot ${crawlerStatus?.paused ? 'warning' : 'online'}`} />
                        <span>Crawler: {crawlerStatus?.paused ? 'Paused' : 'Active'}</span>
                    </div>
                    <div className="status-item">
                        <span className="status-dot online" />
                        <span>Memgraph: Connected</span>
                    </div>
                    <div className="status-item">
                        <span>Memory: {crawlerStatus?.memory_usage_mb || 0} MB</span>
                    </div>
                </div>
            }
            leftSidebar={
                <>
                    <StatsPanel stats={stats} />
                    <PaperList papers={papers || []} isLoading={papersLoading} />
                </>
            }
            rightSidebar={
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Trending Topics</span>
                    </div>
                    {stats?.trending_topics?.map((topic, i) => (
                        <div key={i} className="paper-item">
                            <span className="paper-title">{topic}</span>
                        </div>
                    ))}
                </div>
            }
        >
            <GraphView />
        </HudLayout>
    )
}
