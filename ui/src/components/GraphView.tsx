import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { Paper } from '../App'
interface ApiNode {
    id: string
    type: 'Paper' | 'Concept'
    label: string
    size: number
    paperId?: string
}

interface ApiEdge {
    source: string
    target: string
    type: string
}

export interface GraphData {
    nodes: ApiNode[]
    edges: ApiEdge[]
}

interface GraphViewProps {
    graphData?: GraphData | null
    papers?: Paper[] | null
    onPaperClick?: (paperId: string) => void
    onConceptClick?: (label: string) => void
}

const TOPIC_COLORS: Record<string, string> = {
    'LLM': '#6a8faa', 'Transformers': '#5e7d95',
    'Reinforcement Learning': '#6a9a7a', 'RLHF': '#5e8a6a',
    'Diffusion Models': '#7a6e95', 'Diffusion': '#6e6088',
    'Mixture of Experts': '#957a6a', 'MoE': '#886a5a',
    'Computer Vision': '#95906a',
    'NLP': '#5a7d7d',
    'RAG': '#957080',
    'Agents': '#5a8888',
    'Fine-Tuning': '#7878aa',
    'Multimodal': '#aa8858',
    'Reasoning': '#6a9a82',
    'Code Generation': '#6a6a95',
    'Safety & Alignment': '#956a72',
    'Interpretability': '#7d9a6a',
    'Embeddings': '#6a7d95',
    'Optimization': '#957a6a',
    'Neural Architecture': '#6e7d88',
    'Quantization': '#8888',
    'Robotics': '#6a887d',
}

const MUTED_PALETTE = [
    '#6e7d8a', '#7d7268', '#6e7d62', '#7d6e88', '#627d7d',
    '#887d68', '#6e6e88', '#7d627a', '#627d6e', '#6e887d',
]

function hashColor(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
    return MUTED_PALETTE[Math.abs(hash) % MUTED_PALETTE.length]
}

function guessTopic(paper: Paper): string {
    const cat = (paper as any).category as string || ''
    const title = paper.title.toLowerCase()
    if (cat.includes('CL') || title.includes('language model') || title.includes('llm')) return 'LLM'
    if (cat.includes('CV') || title.includes('vision') || title.includes('image')) return 'Computer Vision'
    if (cat.includes('AI') || title.includes('agent')) return 'Agents'
    if (title.includes('diffusion')) return 'Diffusion'
    if (title.includes('reinforcement') || title.includes('rlhf')) return 'RLHF'
    if (title.includes('retrieval') || title.includes('rag')) return 'RAG'
    if (title.includes('transformer') || title.includes('attention')) return 'Transformers'
    if (title.includes('multimodal')) return 'Multimodal'
    if (title.includes('reasoning')) return 'Reasoning'
    if (title.includes('mixture') || title.includes('moe')) return 'MoE'
    if (title.includes('fine-tun') || title.includes('lora')) return 'Fine-Tuning'
    if (title.includes('code') || title.includes('codegen')) return 'Code Generation'
    if (title.includes('safety') || title.includes('alignment')) return 'Safety & Alignment'
    return 'LLM'
}

interface FGNode {
    id: string
    label: string
    type: string
    color: string
    nodeSize: number
    paperId?: string
    degree: number
    x?: number
    y?: number
    vx?: number
    vy?: number
    fx?: number
    fy?: number
}

interface FGLink {
    source: string
    target: string
}

function buildForceGraphData(graphData: GraphData, papers?: Paper[] | null) {
    const degreeMap = new Map<string, number>()
    graphData.nodes.forEach(n => degreeMap.set(n.id, 0))
    graphData.edges.forEach(e => {
        degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1)
        degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1)
    })

    const nodes: FGNode[] = graphData.nodes.map(n => {
        const deg = degreeMap.get(n.id) || 1
        let color: string
        if (n.type === 'Concept') {
            color = TOPIC_COLORS[n.label] || hashColor(n.label)
        } else if (n.paperId && papers) {
            const paper = papers.find(p => p.id === n.paperId)
            if (paper) {
                color = TOPIC_COLORS[guessTopic(paper)] || hashColor(n.label)
            } else {
                color = hashColor(n.label)
            }
        } else {
            color = hashColor(n.label)
        }

        const baseSize = n.type === 'Concept' ? 8 : 3
        const nodeSize = Math.min(baseSize + deg * 1.2, 16)

        return { id: n.id, label: n.label, type: n.type, color, nodeSize, paperId: n.paperId, degree: deg }
    })

    const nodeIds = new Set(nodes.map(n => n.id))
    const links: FGLink[] = graphData.edges
        .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
        .map(e => ({ source: e.source, target: e.target }))

    return { nodes, links }
}

// ─── Timeline View ──────────────────────────────────
function TimelineView({ papers, onPaperClick }: { papers: Paper[]; onPaperClick?: (paperId: string) => void }) {
    const sorted = useMemo(() =>
        [...papers].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20),
        [papers]
    )

    return (
        <div className="timeline-container">
            <div className="timeline-line" />
            {sorted.map((paper, i) => {
                const topic = guessTopic(paper)
                const color = TOPIC_COLORS[topic] || '#6a8faa'
                return (
                    <div key={paper.id}
                        className={`timeline-item ${i % 2 === 0 ? 'left' : 'right'}`}
                        onClick={() => onPaperClick?.(paper.id)}
                        style={{ animationDelay: `${i * 0.1}s` }}
                    >
                        <div className="timeline-dot" style={{
                            background: color,
                            boxShadow: `0 0 6px ${color}44`
                        }} />
                        <div className="timeline-card">
                            <div className="timeline-date">{paper.date}</div>
                            <div className="timeline-title">{paper.title}</div>
                            <div className="timeline-meta">
                                <span className="timeline-topic" style={{
                                    color, borderColor: color
                                }}>{topic}</span>
                                <span className="paper-score">⬆ {paper.score}</span>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function EmptyState({ message }: { message?: string }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', flexDirection: 'column', gap: '16px', color: 'var(--text-muted)'
        }}>
            <div className="loading-spinner" />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>
                {message || 'Waiting for data…'}
            </span>
        </div>
    )
}

// ─── Force Graph Canvas ─────────────────────────────
function ForceGraphCanvas({ graphData, papers, onPaperClick, onConceptClick }: {
    graphData: GraphData
    papers?: Paper[] | null
    onPaperClick?: (paperId: string) => void
    onConceptClick?: (label: string) => void
}) {
    const fgRef = useRef<any>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [hoveredNode, setHoveredNode] = useState<string | null>(null)
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
    const [settled, setSettled] = useState(false)

    const prevDataRef = useRef<{ nodes: FGNode[]; links: FGLink[] } | null>(null)
    const initialZoomDone = useRef(false)

    useEffect(() => {
        if (!containerRef.current) return
        const observer = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect
            setDimensions({ width: Math.floor(width), height: Math.floor(height) })
        })
        observer.observe(containerRef.current)
        return () => observer.disconnect()
    }, [])

    // Build graph data with position persistence
    const { fgData, adjacency } = useMemo(() => {
        const fresh = buildForceGraphData(graphData, papers)
        const prev = prevDataRef.current

        if (prev) {
            const posMap = new Map<string, { x?: number; y?: number; fx?: number; fy?: number }>()
            for (const n of prev.nodes) {
                if (n.x !== undefined && n.y !== undefined) {
                    posMap.set(n.id, { x: n.x, y: n.y, fx: n.x, fy: n.y })
                }
            }
            // Pin existing nodes so the layout stays stable on data refresh
            for (const node of fresh.nodes) {
                const pos = posMap.get(node.id)
                if (pos) {
                    node.x = pos.x
                    node.y = pos.y
                    node.fx = pos.fx
                    node.fy = pos.fy
                }
            }
        }

        prevDataRef.current = fresh

        const adj = new Map<string, Set<string>>()
        fresh.nodes.forEach(n => adj.set(n.id, new Set()))
        fresh.links.forEach(l => {
            adj.get(l.source as string)?.add(l.target as string)
            adj.get(l.target as string)?.add(l.source as string)
        })

        return { fgData: fresh, adjacency: adj }
    }, [graphData, papers])

    // Configure physics once on data load — then let it settle
    useEffect(() => {
        const fg = fgRef.current
        if (!fg || fgData.nodes.length === 0) return

        fg.d3Force('charge')?.strength(-180).distanceMax(350)
        fg.d3Force('link')?.distance(90).strength(0.4)
        fg.d3Force('center')?.strength(0.03)

        // Don't reheat if graph already settled and we're just refreshing data
        if (!settled) {
            fg.d3ReheatSimulation()
        }
    }, [fgData, settled])

    // Initial zoom-to-fit and freeze after settling
    useEffect(() => {
        if (initialZoomDone.current) return
        const timer = setTimeout(() => {
            if (fgRef.current && fgData.nodes.length > 0) {
                fgRef.current.zoomToFit(600, 80)
                initialZoomDone.current = true
                setSettled(true)

                // Unpin all nodes after settling so dragging works
                for (const node of fgData.nodes) {
                    node.fx = undefined
                    node.fy = undefined
                }
            }
        }, 3000)
        return () => clearTimeout(timer)
    }, [fgData])

    const isLinked = useCallback((nodeId: string) => {
        if (!hoveredNode) return true
        if (nodeId === hoveredNode) return true
        return adjacency.get(hoveredNode)?.has(nodeId) ?? false
    }, [hoveredNode, adjacency])

    const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const linked = isLinked(node.id)
        const isHovered = node.id === hoveredNode
        const isConcept = node.type === 'Concept'
        const r = node.nodeSize / globalScale * 3

        ctx.save()

        // Dim unrelated nodes on hover
        if (hoveredNode && !linked) {
            ctx.globalAlpha = 0.12
        } else {
            ctx.globalAlpha = isConcept ? 1 : 0.85
        }

        // Subtle shadow on hover
        if (isHovered) {
            ctx.shadowColor = node.color
            ctx.shadowBlur = 8
        }

        // Draw node — concept nodes get a ring, paper nodes are solid circles
        ctx.beginPath()
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)

        if (isConcept) {
            // Concept nodes: solid fill + ring border for visual weight
            ctx.fillStyle = `${node.color}88`
            ctx.fill()
            ctx.strokeStyle = node.color
            ctx.lineWidth = 1.8 / globalScale
            ctx.stroke()
        } else {
            // Paper nodes: solid circles
            ctx.fillStyle = `${node.color}cc`
            ctx.fill()
        }

        // Label logic: always show concepts, show papers on hover
        const showLabel = isHovered || isConcept
        if (showLabel) {
            ctx.shadowBlur = 0
            ctx.globalAlpha = isHovered ? 1 : 0.8
            const label = node.label || ''
            const displayLabel = isConcept ? label : (label.length > 35 ? label.slice(0, 32) + '…' : label)
            const fontSize = Math.max((isHovered ? 12 : 10) / globalScale, 2)
            ctx.font = `${isHovered ? 600 : 500} ${fontSize}px Inter, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'bottom'

            const textWidth = ctx.measureText(displayLabel).width
            const pad = fontSize * 0.3

            // Label background pill
            const bgX = node.x - textWidth / 2 - pad * 2
            const bgY = node.y - r - fontSize - pad * 2
            const bgW = textWidth + pad * 4
            const bgH = fontSize + pad * 2
            const bgR = 3 / globalScale

            ctx.fillStyle = isHovered ? 'rgba(12,13,16,0.9)' : 'rgba(12,13,16,0.7)'
            ctx.beginPath()
            ctx.roundRect(bgX, bgY, bgW, bgH, bgR)
            ctx.fill()

            ctx.fillStyle = isHovered ? '#e0e4ec' : '#b0b8c8'
            ctx.fillText(displayLabel, node.x, node.y - r - pad)
        }

        ctx.restore()
    }, [hoveredNode, isLinked])

    const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source
        const targetId = typeof link.target === 'object' ? link.target.id : link.target
        const sx = typeof link.source === 'object' ? link.source.x : 0
        const sy = typeof link.source === 'object' ? link.source.y : 0
        const tx = typeof link.target === 'object' ? link.target.x : 0
        const ty = typeof link.target === 'object' ? link.target.y : 0

        const isConnected = hoveredNode && (sourceId === hoveredNode || targetId === hoveredNode)

        ctx.save()
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(tx, ty)

        if (hoveredNode) {
            if (isConnected) {
                ctx.strokeStyle = 'rgba(200,208,220,0.3)'
                ctx.lineWidth = 0.8 / globalScale
                ctx.globalAlpha = 0.6
            } else {
                ctx.strokeStyle = 'rgba(200,208,220,0.03)'
                ctx.lineWidth = 0.3 / globalScale
                ctx.globalAlpha = 0.15
            }
        } else {
            ctx.strokeStyle = 'rgba(200,208,220,0.1)'
            ctx.lineWidth = 0.4 / globalScale
            ctx.globalAlpha = 0.4
        }

        ctx.stroke()
        ctx.restore()
    }, [hoveredNode])

    const handleNodeClick = useCallback((node: any) => {
        if (node.type === 'Paper' && node.paperId) {
            onPaperClick?.(node.paperId)
        } else if (node.type === 'Concept') {
            onConceptClick?.(node.label)
        }
    }, [onPaperClick, onConceptClick])

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
            <ForceGraph2D
                ref={fgRef}
                graphData={fgData}
                width={dimensions.width}
                height={dimensions.height}
                backgroundColor="transparent"
                nodeCanvasObject={paintNode}
                nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
                    const r = Math.max((node.nodeSize / globalScale) * 3, 6 / globalScale)
                    ctx.beginPath()
                    ctx.arc(node.x, node.y, r + 4 / globalScale, 0, 2 * Math.PI)
                    ctx.fillStyle = color
                    ctx.fill()
                }}
                linkCanvasObject={paintLink}
                onNodeHover={(node: any) => setHoveredNode(node?.id || null)}
                onNodeClick={handleNodeClick}
                onBackgroundClick={() => setHoveredNode(null)}
                d3AlphaDecay={0.05}
                d3AlphaMin={0.08}
                d3VelocityDecay={0.55}
                cooldownTicks={150}
                warmupTicks={100}
                enableZoomInteraction={true}
                enablePanInteraction={true}
                enableNodeDrag={true}
                minZoom={0.3}
                maxZoom={6}
            />
        </div>
    )
}

// ─── Main Graph View ────────────────────────────────
type ViewMode = '3d' | 'timeline'

export function GraphView({ graphData, papers, onPaperClick, onConceptClick }: GraphViewProps) {
    const [activeView, setActiveView] = useState<ViewMode>('3d')

    const hasData = graphData && graphData.nodes && graphData.nodes.length > 0

    return (
        <div className="graph-container">
            <div className="graph-overlay">
                {(['3d', 'timeline'] as ViewMode[]).map(mode => (
                    <button key={mode}
                        className={`graph-button ${activeView === mode ? 'active' : ''}`}
                        onClick={() => setActiveView(mode)}
                    >
                        {mode === '3d' ? '◉ Network' : '◷ Timeline'}
                    </button>
                ))}
                {activeView === '3d' && hasData && (
                    <span className="graph-node-count">
                        {graphData!.nodes.length} nodes · {graphData!.edges.length} edges
                    </span>
                )}
            </div>

            {activeView === '3d' && (
                hasData ? (
                    <ForceGraphCanvas
                        graphData={graphData!}
                        papers={papers}
                        onPaperClick={onPaperClick}
                        onConceptClick={onConceptClick}
                    />
                ) : <EmptyState message="Waiting for graph data…" />
            )}

            {activeView === 'timeline' && (
                papers && papers.length > 0
                    ? <TimelineView papers={papers} onPaperClick={onPaperClick} />
                    : <EmptyState message="Waiting for papers…" />
            )}
        </div>
    )
}
