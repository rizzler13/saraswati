import { useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider } from './components/auth/AuthContext'
import { HudLayout, type TabView } from './components/HudLayout'
import { PaperList } from './components/PaperList'
import { StatsPanel } from './components/StatsPanel'
import { GraphView, type GraphData } from './components/GraphView'
import { PaperDetailModal } from './components/PaperDetailModal'
import { ResearchPanel } from './components/ResearchPanel'
import { ResearchTab } from './components/ResearchTab'
import { ProfilePage } from './components/ProfilePage'
import { AgentChat } from './components/AgentChat'
import { usePolling } from './hooks/usePolling'

export interface Paper {
  id: string
  title: string
  abstract: string
  authors: string[]
  date: string
  source: string
  url: string
  score: number
  category?: string
  tags?: string[]
  hf_upvotes?: number
  pdf_url?: string
  code_url?: string
  github_stars?: number
  github_forks?: number
  github_velocity?: number
}

function App() {
  const [activeTab, setActiveTab] = useState<TabView>('trending')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null)
  const [researchPaper, setResearchPaper] = useState<Paper | null>(null)
  const [deepResearchPaper, setDeepResearchPaper] = useState<Paper | null>(null)

  const { data: papers } = usePolling<Paper[]>('/api/papers/trending', 30000)
  const { data: stats } = usePolling<any>('/api/stats', 30000)
  const { data: graphData } = usePolling<GraphData>('/api/graph', 60000)



  const handlePaperClick = (paper: Paper) => setSelectedPaper(paper)
  const handleResearch = (paper: Paper) => {
    setSelectedPaper(null)
    setResearchPaper(paper)
  }
  const handleDeepResearch = (paper: Paper) => {
    setSelectedPaper(null)
    setResearchPaper(null)
    setDeepResearchPaper(paper)
    setActiveTab('research')
  }

  return (
    <ErrorBoundary>
    <AuthProvider>
      <HudLayout
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab)
          if (tab !== 'research') setDeepResearchPaper(null)
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      >
        {/* Trending tab */}
        {activeTab === 'trending' && (
          <div className="page-layout">
            <StatsPanel
              papers={papers || []}
              activeDomain={searchQuery}
              stats={stats}
              onDomainClick={(domain: string) => setSearchQuery(domain)}
            />
            <main className="page-main">
              <PaperList
                onPaperClick={handlePaperClick}
                searchQuery={searchQuery}
              />
            </main>
          </div>
        )}

        {/* Methods tab */}
        {activeTab === 'methods' && (
          <GraphView
            graphData={graphData}
            onConceptClick={(label: string) => {
              setSearchQuery(label)
              setActiveTab('trending')
            }}
          />
        )}

        {/* Research tab */}
        {activeTab === 'research' && (
          <ResearchTab
            initialPaper={deepResearchPaper}
            onPaperClick={handlePaperClick}
          />
        )}

        {/* Agent tab */}
        {activeTab === 'agent' && (
          <AgentChat />
        )}

        {/* Profile tab */}
        {activeTab === 'profile' && (
          <ProfilePage
            onOpenChat={(paper) => {
              const fullPaper: Paper = {
                id: paper.id,
                title: paper.title,
                abstract: '',
                authors: [],
                date: '',
                source: 'arxiv',
                url: `https://arxiv.org/abs/${paper.id}`,
                score: 0
              }
              handleResearch(fullPaper)
            }}
            onOpenDeepDive={(paper) => {
              const fullPaper: Paper = {
                id: paper.id,
                title: paper.title,
                abstract: '',
                authors: [],
                date: '',
                source: 'arxiv',
                url: `https://arxiv.org/abs/${paper.id}`,
                score: 0
              }
              handleDeepResearch(fullPaper)
            }}
          />
        )}

        {/* Paper detail modal */}
        {selectedPaper && (
          <PaperDetailModal
            paper={selectedPaper}
            onClose={() => setSelectedPaper(null)}
            onResearch={handleResearch}
            onDeepResearch={handleDeepResearch}
          />
        )}

        {/* Research chat panel */}
        {researchPaper && (
          <ResearchPanel
            paper={researchPaper}
            allPapers={papers || []}
            onClose={() => setResearchPaper(null)}
          />
        )}
      </HudLayout>
    </AuthProvider>
    </ErrorBoundary>
  )
}

export default App