import { useState, useEffect } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider, useAuth } from './components/auth/AuthContext'
import { HudLayout, type TabView } from './components/HudLayout'
import { PaperList } from './components/PaperList'
import { GraphView, type GraphData } from './components/GraphView'
import { PaperDetailModal } from './components/PaperDetailModal'
import { ResearchPanel } from './components/ResearchPanel'
import { ResearchTab } from './components/ResearchTab'
import { ProfilePage } from './components/ProfilePage'
import { AgentChat } from './components/AgentChat'
import { usePolling } from './hooks/usePolling'
import { LandingPage } from './components/LandingPage'
import { AuthModal } from './components/auth/AuthModal'

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

function MainApp() {
  const { user, loading, chats } = useAuth()
  const [activeTab, setActiveTab] = useState<TabView>('trending')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null)
  const [researchPaper, setResearchPaper] = useState<Paper | null>(null)
  const [deepResearchPaper, setDeepResearchPaper] = useState<Paper | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [viewingApp, setViewingApp] = useState(false)
  const [agentAttachedPaper, setAgentAttachedPaper] = useState<Paper | null>(null)

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

  const handleDomainClick = (domain: string) => {
    setSearchQuery(domain)
    setActiveTab('trending')
  }

  const handleAuthAction = (mode: 'login' | 'signup') => {
    if (user) {
      setViewingApp(true)
    } else {
      setAuthMode(mode)
      setShowAuth(true)
    }
  }

  // Transition to the app automatically when a user logs in via AuthModal
  useEffect(() => {
    if (user) {
      setShowAuth(false)
      setViewingApp(true)
    }
  }, [user])

  // Reset view state if user logs out
  useEffect(() => {
    if (!user) {
      setViewingApp(false)
    }
  }, [user])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#f9f9f9] text-[#1a1c1c]">
        <div className="loading-spinner mb-4" style={{ width: 40, height: 40, border: '4px solid rgba(149, 67, 48, 0.1)', borderTopColor: '#954330', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <span className="font-semibold text-sm tracking-wider uppercase opacity-85">Initializing Saraswati...</span>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  if (!viewingApp) {
    return (
      <>
        <LandingPage onAuthAction={handleAuthAction} />
        {showAuth && (
          <AuthModal 
            onClose={() => setShowAuth(false)} 
            initialMode={authMode} 
          />
        )}
      </>
    )
  }

  return (
    <HudLayout
      activeTab={activeTab}
      onTabChange={(tab) => {
        setActiveTab(tab)
        if (tab !== 'research') setDeepResearchPaper(null)
      }}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      papers={papers || []}
      stats={stats}
      onDomainClick={handleDomainClick}
    >
      {/* Trending tab */}
      {activeTab === 'trending' && (
        <PaperList
          onPaperClick={handlePaperClick}
          searchQuery={searchQuery}
        />
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
        <AgentChat
          attachedPaper={agentAttachedPaper}
          setAttachedPaper={setAgentAttachedPaper}
        />
      )}

      {/* Profile tab */}
      {activeTab === 'profile' && (
        <ProfilePage
          onOpenChat={(paper) => {
            const session = chats.find(c => c.paperId === paper.id)
            if (paper.id === 'global') {
              setAgentAttachedPaper(null)
            } else {
              const fullPaper: Paper = session?.attachedPaper || {
                id: paper.id,
                title: paper.title,
                abstract: '',
                authors: [],
                date: '',
                source: 'arxiv',
                url: `https://arxiv.org/abs/${paper.id}`,
                score: 0
              }
              setAgentAttachedPaper(fullPaper)
            }
            setActiveTab('agent')
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
  )
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App