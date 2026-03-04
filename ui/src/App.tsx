import { useState } from 'react'
import { HudLayout } from './components/HudLayout'
import { PaperList } from './components/PaperList'
import { StatsPanel } from './components/StatsPanel'
import { GraphView, type GraphData } from './components/GraphView'
import { PaperDetailModal } from './components/PaperDetailModal'
import { StatDetailModal } from './components/StatDetailModal'
import { DiscourseFeed } from './components/DiscourseFeed'
import { usePolling } from './hooks/usePolling'

export interface Paper {
    id: string
    title: string
    abstract: string
    authors?: string[]
    date: string
    score: number
    source?: string
    category?: string
    url?: string
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
        8000
    )

    const { data: stats } = usePolling<Stats>('/api/stats', 15000)
    const { data: crawlerStatus } = usePolling<CrawlerStatus>('/api/crawler/status', 5000)
    const { data: graphData } = usePolling<GraphData>('/api/graph', 10000)

    const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null)
    const [statDetailType, setStatDetailType] = useState<'papers' | 'mentions' | 'topics' | null>(null)

    const handlePaperById = (paperId: string) => {
        const paper = papers?.find(p => p.id === paperId)
        if (paper) setSelectedPaper(paper)
    }

    const handleDiscoursePaperClick = (arxivId: string) => {
        const paper = papers?.find(p => p.id === arxivId)
        if (paper) setSelectedPaper(paper)
    }

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
                    <div className="status-item" title="Backend process resident memory">
                        <span>RSS: {crawlerStatus?.memory_usage_mb || 0} MB</span>
                    </div>
                </div>
            }
            leftSidebar={
                <>
                    <StatsPanel
                        stats={stats}
                        onStatClick={(type) => setStatDetailType(type as any)}
                    />
                    <PaperList
                        papers={papers || []}
                        isLoading={papersLoading}
                        onPaperClick={setSelectedPaper}
                        selectedPaperId={selectedPaper?.id ?? null}
                    />
                </>
            }
            rightSidebar={
                <DiscourseFeed onPaperClick={handleDiscoursePaperClick} />
            }
        >
            <GraphView
                graphData={graphData}
                papers={papers}
                onPaperClick={handlePaperById}
                onConceptClick={() => { }}
            />

            {selectedPaper && (
                <PaperDetailModal
                    paper={selectedPaper}
                    onClose={() => setSelectedPaper(null)}
                />
            )}

            {statDetailType && (
                <StatDetailModal
                    type={statDetailType}
                    onClose={() => setStatDetailType(null)}
                />
            )}
        </HudLayout>
    )
}
