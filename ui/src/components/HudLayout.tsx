import { ReactNode } from 'react'

interface HudLayoutProps {
    header?: ReactNode
    leftSidebar?: ReactNode
    rightSidebar?: ReactNode
    children: ReactNode
    crawlerStatus?: { paused: boolean } | null
}

export function HudLayout({ header, leftSidebar, rightSidebar, children }: HudLayoutProps) {
    return (
        <div className="app">
            <div className="scanline" />

            <header className="header">
                <div className="logo">
                    <div className="logo-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                            <circle cx="12" cy="12" r="4" />
                        </svg>
                    </div>
                    <span className="logo-text">SARASWATI</span>
                </div>
                {header}
            </header>

            <aside className="sidebar-left">
                {leftSidebar}
            </aside>

            <main className="main-view">
                {children}
            </main>

            <aside className="sidebar-right">
                {rightSidebar}
            </aside>
        </div>
    )
}
