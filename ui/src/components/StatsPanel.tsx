import { useState, useEffect, useRef } from 'react'

interface Stats {
    papers_total: number
    mentions_total: number
    papers_today: number
    trending_topics: string[]
}

interface StatsPanelProps {
    stats: Stats | null
    onStatClick?: (type: string) => void
}

function useCountUp(target: number, duration: number = 1200) {
    const [value, setValue] = useState(0)
    const prevTarget = useRef(0)

    useEffect(() => {
        if (target === 0) return
        const start = prevTarget.current
        prevTarget.current = target
        const diff = target - start
        const startTime = performance.now()

        const animate = (now: number) => {
            const elapsed = now - startTime
            const progress = Math.min(elapsed / duration, 1)
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3)
            setValue(Math.round(start + diff * eased))
            if (progress < 1) requestAnimationFrame(animate)
        }

        requestAnimationFrame(animate)
    }, [target, duration])

    return value
}

function AnimatedStat({ target, label, color, onClick }: { target: number; label: string; color?: string; onClick?: () => void }) {
    const value = useCountUp(target)
    const [flash, setFlash] = useState(false)
    const prevValue = useRef(target)

    useEffect(() => {
        if (prevValue.current !== target && prevValue.current !== 0) {
            setFlash(true)
            const t = setTimeout(() => setFlash(false), 600)
            prevValue.current = target
            return () => clearTimeout(t)
        }
        prevValue.current = target
    }, [target])

    return (
        <div className={`stat-box ${flash ? 'stat-flash' : ''} ${onClick ? 'stat-clickable' : ''}`} onClick={onClick}>
            <div className="stat-value" style={color ? { color } : undefined}>
                {value.toLocaleString()}
            </div>
            <div className="stat-label">{label}</div>
        </div>
    )
}

export function StatsPanel({ stats, onStatClick }: StatsPanelProps) {
    return (
        <div className="card">
            <div className="card-header">
                <span className="card-title">System Stats</span>
                <span className="stat-live-dot" title="Live data" />
            </div>
            <div className="stat-grid">
                <AnimatedStat
                    target={stats?.papers_total ?? 0}
                    label="Total Papers"
                    onClick={() => onStatClick?.('papers')}
                />
                <AnimatedStat
                    target={stats?.mentions_total ?? 0}
                    label="Mentions"
                    onClick={() => onStatClick?.('mentions')}
                />
                <AnimatedStat
                    target={stats?.papers_today ?? 0}
                    label="Today"
                    onClick={() => onStatClick?.('papers')}
                />
                <AnimatedStat
                    target={stats?.trending_topics?.length ?? 0}
                    label="Topics"
                    color="var(--accent-secondary)"
                    onClick={() => onStatClick?.('topics')}
                />
            </div>
        </div>
    )
}
