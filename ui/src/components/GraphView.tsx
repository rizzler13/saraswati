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

// Muted, desaturated palette — subtle and easy on the eyes

const NODE_COLORS = [
    '#7a8fa6', '#8b7e72', '#7d8a6e', '#8a7d96', '#6e8a8a',
    '#968a7d', '#7a7d96', '#8a6e7d', '#6e8a7a', '#7d968a',
    '#96817d', '#7d8196', '#8a7d6e', '#6e7d8a', '#7d8a81',
    '#917d8a', '#6e8a85', '#8a856e', '#7d6e8a', '#858a7d',
    '#8a7d7d', '#6e858a', '#7d8a6e', '#8a6e85', '#7d8a96',
    '#857d8a', '#6e8a6e', '#8a7d85', '#7d968a', '#8a856e',
]

function hashColor(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash)
        hash = hash & hash
    }
    return NODE_COLORS[Math.abs(hash) % NODE_COLORS.length]
}

const topicColors: Record<string, string> = {
    'LLM': '#6a9fb5', 'Transformers': '#5e8aaa',
    'Reinforcement Learning': '#6aaa80', 'RLHF': '#5e9a70',
    'Diffusion Models': '#8a7aaa', 'Diffusion': '#7a6a9a',
    'Mixture of Experts': '#aa7a6a', 'MoE': '#9a6a5a',
    'Computer Vision': '#aa9a6a',
    'NLP': '#5a8a8a',
    'RAG': '#aa7a8a',
    'Agents': '#5a9a9a',
    'Fine-Tuning': '#8a8aaa',
    'Multimodal': '#aa8a5a',
    'Reasoning': '#6aaa8a',
    'Code Generation': '#6a6aaa',
    'Safety & Alignment': '#aa6a7a',
    'Interpretability': '#8aaa6a',
    'Embeddings': '#6a8aaa',
    'Optimization': '#aa7a6a',
    'Neural Architecture': '#7a8a96',
    'Quantization': '#9a9a6a',
    'Robotics': '#6a9a8a',
    'Federated Learning': '#5a6a7a',
    'World Models': '#5a6aaa',
    'Synthetic Data': '#5a8a6a',
    'Speech & Audio': '#8a6a5a',
    'Graph Neural Networks': '#5a7a8a',
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
            color = topicColors[n.label] || hashColor(n.label)
        } else if (n.paperId && papers) {
            const paper = papers.find(p => p.id === n.paperId)
            if (paper) {
                const topic = guessTopic(paper)
                color = topicColors[topic] || hashColor(n.label)
            } else {
                color = hashColor(n.label)
            }
        } else {
            color = hashColor(n.label)
        }

        // Size: concepts are bigger, scale by degree
        const baseSize = n.type === 'Concept' ? 6 : 3
        const nodeSize = Math.min(baseSize + deg * 1.5, 18)

        return {
            id: n.id,
            label: n.label,
            type: n.type,
            color,
            nodeSize,
            paperId: n.paperId,
            degree: deg,
        }
    })

    const nodeIds = new Set(nodes.map(n => n.id))
    const links: FGLink[] = graphData.edges
        .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
        .map(e => ({ source: e.source, target: e.target }))

    return { nodes, links }
}
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
                const color = topicColors[topic] || '#6a9fb5'
                return (
                    <div key={paper.id}
                        className={`timeline-item ${i % 2 === 0 ? 'left' : 'right'}`}
                        onClick={() => onPaperClick?.(paper.id)}
                        style={{ animationDelay: `${i * 0.1}s` }}
                    >
                        <div className="timeline-dot" style={{
                            background: color,
                            boxShadow: `0 0 8px ${color}66`
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
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {message || 'Waiting for data…'}
            </span>
        </div>
    )
}
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

    const { fgData, adjacency } = useMemo(() => {
        const fresh = buildForceGraphData(graphData, papers)
        const prev = prevDataRef.current

        if (prev) {
            // Build a position map from previous nodes
            const posMap = new Map<string, { x?: number; y?: number; vx?: number; vy?: number }>()
            for (const n of prev.nodes) {
                if (n.x !== undefined && n.y !== undefined) {
                    posMap.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy })
                }
            }

            // Carry positions forward to matching node IDs
            for (const node of fresh.nodes) {
                const pos = posMap.get(node.id)
                if (pos) {
                    node.x = pos.x
                    node.y = pos.y
                    node.vx = pos.vx
                    node.vy = pos.vy
                }
            }
        }

        // Store reference for next update
        prevDataRef.current = fresh

        // Build adjacency for hover highlighting
        const adj = new Map<string, Set<string>>()
        fresh.nodes.forEach(n => adj.set(n.id, new Set()))
        fresh.links.forEach(l => {
            adj.get(l.source as string)?.add(l.target as string)
            adj.get(l.target as string)?.add(l.source as string)
        })

        return { fgData: fresh, adjacency: adj }
    }, [graphData, papers])

    useEffect(() => {
        const fg = fgRef.current
        if (!fg || fgData.nodes.length === 0) return

        fg.d3Force('charge')?.strength(-200).distanceMax(400)

        fg.d3Force('link')?.distance(80).strength(0.3)

        fg.d3Force('center')?.strength(0.05)

        fg.d3ReheatSimulation()
    }, [fgData])

    useEffect(() => {
        if (initialZoomDone.current) return
        const timer = setTimeout(() => {
            if (fgRef.current && fgData.nodes.length > 0) {
                fgRef.current.zoomToFit(400, 60)
                initialZoomDone.current = true
            }
        }, 2000)
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
        const r = node.nodeSize / globalScale * 3

        ctx.save()

        // Opacity: fade non-connected when hovering
        if (hoveredNode && !linked) {
            ctx.globalAlpha = 0.12
        } else {
            ctx.globalAlpha = 0.85
        }

        // Subtle outer glow for hovered / concept nodes
        if (isHovered || (node.type === 'Concept' && linked)) {
            ctx.shadowColor = node.color
            ctx.shadowBlur = isHovered ? 12 : 5
        }

        // Main circle
        ctx.beginPath()
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
        ctx.fillStyle = node.color
        ctx.fill()

        // Subtle border
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'
        ctx.lineWidth = 0.3
        ctx.stroke()

        // Always show labels on Concept nodes (they're structural hubs)
        const showLabel = isHovered || node.type === 'Concept'
        if (showLabel) {
            ctx.shadowBlur = 0
            ctx.globalAlpha = isHovered ? 1 : 0.7
            const label = node.label || ''
            const fontSize = Math.max((isHovered ? 12 : 10) / globalScale, 2.5)
            ctx.font = `${isHovered ? 600 : 500} ${fontSize}px "JetBrains Mono", monospace`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'bottom'

            // Background box
            const textWidth = ctx.measureText(label).width
            const padding = fontSize * 0.3
            ctx.fillStyle = isHovered ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.6)'
            ctx.fillRect(
                node.x - textWidth / 2 - padding,
                node.y - r - fontSize - padding * 2,
                textWidth + padding * 2,
                fontSize + padding * 2
            )

            // Label text
            ctx.fillStyle = isHovered ? '#e0e0e0' : '#b0b0b0'
            ctx.fillText(label, node.x, node.y - r - padding)
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
                const sourceNode = typeof link.source === 'object' ? link.source : null
                ctx.strokeStyle = sourceNode?.color || 'rgba(255,255,255,0.25)'
                ctx.lineWidth = 1.0 / globalScale
                ctx.globalAlpha = 0.5
            } else {
                ctx.strokeStyle = 'rgba(255,255,255,0.03)'
                ctx.lineWidth = 0.3 / globalScale
                ctx.globalAlpha = 0.2
            }
        } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.15)'
            ctx.lineWidth = 0.5 / globalScale
            ctx.globalAlpha = 0.5
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
                    // Use a generous minimum hit area so nodes are easy to hover/click
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
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.3}
                cooldownTicks={300}
                warmupTicks={200}
                enableZoomInteraction={true}
                enablePanInteraction={true}
                enableNodeDrag={true}
            />
        </div>
    )
}
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
                        {mode === '3d' ? '◉ Network Graph' : '◷ Timeline'}
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
