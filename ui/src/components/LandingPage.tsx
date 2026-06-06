import { useEffect, useState } from 'react'

interface LandingPageProps {
  onAuthAction: (mode: 'login' | 'signup') => void
}

export function LandingPage({ onAuthAction }: LandingPageProps) {
  const [scrolledY, setScrolledY] = useState(0)

  useEffect(() => {
    // 1. Inject modern fonts and Material Icons
    const linkFonts = document.createElement('link')
    linkFonts.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Inter:wght@400;600&family=Source+Serif+4:ital,wght@0,400;1,400&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
    linkFonts.rel = "stylesheet"
    linkFonts.id = "landing-google-fonts"
    document.head.appendChild(linkFonts)

    // 2. Inject Tailwind CDN with custom config
    const scriptTailwind = document.createElement('script')
    scriptTailwind.src = "https://cdn.tailwindcss.com?plugins=forms,container-queries"
    scriptTailwind.id = "landing-tailwind-script"
    scriptTailwind.onload = () => {
      // Configure tailwind theme extensions inline
      (window as any).tailwind.config = {
        darkMode: "class",
        theme: {
          extend: {
            colors: {
              "on-error": "#ffffff",
              "on-secondary-container": "#636262",
              "on-secondary-fixed-variant": "#474746",
              "on-background": "#1a1c1c",
              "on-secondary": "#ffffff",
              "on-error-container": "#93000a",
              "secondary-fixed": "#e5e2e1",
              "on-surface-variant": "#55433e",
              "tertiary-fixed": "#88f6db",
              "error": "#ba1a1a",
              "surface-container-low": "#f3f3f3",
              "surface-container-lowest": "#ffffff",
              "surface-container-highest": "#e2e2e2",
              "on-tertiary-fixed": "#00201a",
              "surface-variant": "#e2e2e2",
              "inverse-on-surface": "#f1f1f1",
              "surface-bright": "#f9f9f9",
              "primary-fixed-dim": "#ffb4a3",
              "surface-container-high": "#e8e8e8",
              "primary": "#954330",
              "tertiary": "#006857",
              "surface-tint": "#984632",
              "error-container": "#ffdad6",
              "on-primary": "#ffffff",
              "secondary": "#5f5e5e",
              "on-secondary-fixed": "#1c1b1b",
              "primary-container": "#b45b46",
              "surface-container": "#eeeeee",
              "surface": "#f9f9f9",
              "on-primary-fixed": "#3d0600",
              "primary-fixed": "#ffdad2",
              "on-tertiary": "#ffffff",
              "secondary-fixed-dim": "#c8c6c5",
              "tertiary-fixed-dim": "#6ad9bf",
              "inverse-surface": "#2f3131",
              "background": "#f9f9f9",
              "outline": "#88726d",
              "on-primary-container": "#fffbff",
              "on-primary-fixed-variant": "#7a2f1e",
              "on-tertiary-container": "#f4fffa",
              "outline-variant": "#dbc1bb",
              "on-surface": "#1a1c1c",
              "surface-dim": "#dadada",
              "tertiary-container": "#00846f",
              "secondary-container": "#e2dfde",
              "inverse-primary": "#ffb4a3",
              "on-tertiary-fixed-variant": "#005143"
            },
            borderRadius: {
              "DEFAULT": "0.125rem",
              "lg": "0.25rem",
              "xl": "0.5rem",
              "full": "0.75rem"
            },
            spacing: {
              "container-max": "1280px",
              "margin-mobile": "16px",
              "stack-lg": "32px",
              "stack-sm": "8px",
              "gutter": "24px",
              "stack-md": "16px",
              "sidebar-width": "260px"
            },
            fontFamily: {
              "headline-lg": ["Manrope"],
              "label-caps": ["Inter"],
              "body-lg": ["Inter"],
              "serif-quote": ["Source Serif 4"],
              "headline-xl": ["Manrope"],
              "headline-md": ["Manrope"],
              "body-sm": ["Inter"],
              "body-md": ["Inter"]
            },
            fontSize: {
              "headline-lg": ["24px", { "lineHeight": "1.3", "fontWeight": "600" }],
              "label-caps": ["11px", { "letterSpacing": "0.05em", "fontWeight": "600" }],
              "body-lg": ["16px", { "lineHeight": "1.6", "fontWeight": "400" }],
              "serif-quote": ["18px", { "lineHeight": "1.6", "fontWeight": "400" }],
              "headline-xl": ["36px", { "lineHeight": "1.2", "fontWeight": "700" }],
              "headline-md": ["18px", { "lineHeight": "1.4", "fontWeight": "600" }],
              "body-sm": ["12px", { "lineHeight": "1.4", "fontWeight": "400" }],
              "body-md": ["14px", { "lineHeight": "1.5", "fontWeight": "400" }]
            }
          }
        }
      }
    }
    document.head.appendChild(scriptTailwind)

    // 3. Setup smooth parallax-lite scroll handler
    const handleScroll = () => {
      setScrolledY(window.pageYOffset)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      // Clean up dynamic tags
      document.getElementById('landing-google-fonts')?.remove()
      document.getElementById('landing-tailwind-script')?.remove()
      window.removeEventListener('scroll', handleScroll)
      
      // Clean up style tags generated by Tailwind CDN
      const styles = document.querySelectorAll('style')
      styles.forEach(s => {
        if (s.textContent?.includes('tailwindcss') || s.id?.includes('tailwind')) {
          s.remove()
        }
      })
    }
  }, [])

  return (
    <div className="bg-[#f9f9f9] text-[#1a1c1c] font-sans antialiased selection:bg-[#ffdad2] selection:text-[#3d0600]">
      {/* Inline styles for background pattern and custom elements */}
      <style>{`
        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
          vertical-align: middle;
        }
        .pattern-bg {
          background-color: #f9f9f9;
          background-image: radial-gradient(#dbc1bb 0.5px, transparent 0.5px);
          background-size: 24px 24px;
        }
        .glass-card {
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(8px);
          border: 1px solid #e2e2e2;
        }
        .text-accent { color: #954330; }
        .bg-accent { background-color: #954330; }
        .border-accent { border-color: #954330; }
      `}</style>

      {/* TopNavBar */}
      <header className="bg-[#f9f9f9] border-b border-[#e2e2e2] py-4">
        <div className="max-w-5xl mx-auto px-6 flex flex-row items-center justify-between">
          <div className="brand-logo">
            <img 
              alt="Saraswati Research" 
              className="w-auto object-contain h-12" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAp76fQJSZq2gwmZ0DQ2x1BHm0WRJw-dd5_EjgKp-DiE9093peQci-ybbh9ODFOz6zjYhzRz5pu0erm51OpTkAIi4BxJi4SnPnjQVoIbxi2r7sySjgi8ZTAW_a3vtSxeW3DibOpUIhtpyNAs14T6TtWOQXjKKCNDWASvmDPIZqS4Miz7eu_5jIrFAbejnaBabhnPADdr05Y99H8rCBwRGSaVteN_ZUz98LKpj19FYAGWSZD1MDdhHT4ho4Afb7jiK1z9_E_snUidBQ" 
            />
          </div>
          <div className="auth-actions flex items-center gap-4 text-[18px] font-semibold font-headline-md">
            <button 
              onClick={() => onAuthAction('login')}
              className="px-4 py-2 text-[#954330] font-bold hover:bg-[#ffdad2] rounded-lg transition-all duration-200 text-sm"
            >
              Sign In
            </button>
            <div className="w-px h-6 bg-[#dbc1bb]"></div>
            <button 
              onClick={() => onAuthAction('signup')}
              className="px-6 py-2 bg-[#954330] text-white font-bold rounded-lg hover:bg-[#b45b46] shadow-sm transition-all duration-200 text-sm"
            >
              Sign Up
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="pattern-bg relative overflow-hidden py-12 md:py-16">
          <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <h1 className="font-bold text-[36px] md:text-[44px] text-[#1a1c1c] max-w-2xl leading-tight font-headline-xl">
                The Intelligent Layer for <span className="text-[#954330]">Scientific Research</span>
              </h1>
              <p className="text-[16px] md:text-[18px] text-[#5f5e5e] max-w-xl font-body-lg">
                Deep dive into any arXiv paper with our AI agent and stay ahead with real-time trending feeds. Synthesize complex literature in seconds, not hours.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <button 
                  onClick={() => onAuthAction('signup')}
                  className="px-8 py-4 bg-[#954330] text-white font-bold rounded-lg shadow-lg hover:bg-[#b45b46] transition-all flex items-center justify-center gap-2 group"
                >
                  Get Started for Free
                  <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </button>
                <button 
                  onClick={() => onAuthAction('login')}
                  className="px-8 py-4 bg-[#f9f9f9] border border-[#dbc1bb] text-[#1a1c1c] font-semibold rounded-lg hover:bg-[#eeeeee] transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">trending_up</span>
                  Explore Trending Papers
                </button>
              </div>
            </div>
            
            {/* Parallax Hero Image Container */}
            <div 
              className="lg:col-span-5 relative hidden lg:block transition-transform duration-100 ease-out" 
              style={{ transform: `translateY(${scrolledY * 0.05}px)` }}
            >
              <div className="relative z-10 p-2 glass-card rounded-xl shadow-2xl rotate-1 hover:rotate-0 transition-transform duration-500 cursor-pointer" onClick={() => onAuthAction('login')}>
                <img 
                  alt="Analysis View" 
                  className="rounded-lg border border-[#e2e2e2] shadow-inner" 
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCgyr9W39E7sLm7bLfAslvFcTaqgUDLQZS_WH2uZrzWGkvUIIKCFH9lzfoUNnEtBqB1Nl2RjrAJgkMcX61_JHeKbNHXjViUkpRDqMQVpRPLSrgcu5hlUlnnm0fTlbJdoL4cKrNkl4b_xl5m94JfkgNXX5qmqyYUBj_isM4D4VT2KeQJFVCjUmg8iBA0uVM7x8wn2x0TmbfUtKxZeUphU7sUQVoCReMeSEwECn-gt1srJshjlRrgocAtdhodVoJn9ywUNTP7eOaD-Ag" 
                />
              </div>
              <div className="absolute -top-10 -right-10 w-64 h-64 bg-[#954330]/5 rounded-full blur-3xl -z-10"></div>
              <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-[#006857]/5 rounded-full blur-3xl -z-10"></div>
            </div>
          </div>
        </section>

        {/* AI Research Agent Section */}
        <section className="py-12 bg-[#f9f9f9] border-y border-[#dbc1bb]">
          <div className="max-w-5xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-5 space-y-6">
                <h2 className="text-[32px] md:text-[36px] font-bold text-[#1a1c1c] font-headline-xl">AI Research Agent</h2>
                <p className="text-[16px] text-[#5f5e5e] font-body-lg">Eliminate manual cross-referencing. Our agent provides real-time verification of claims against source literature with surgical precision.</p>
                <ul className="space-y-3 text-sm text-[#55433e] font-body-md">
                  <li className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#954330]" style={{ fontSize: '18px' }}>check_circle</span> 
                    Automated LaTeX derivation proofs
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#954330]" style={{ fontSize: '18px' }}>check_circle</span> 
                    Logical tethering to source PDFs
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#954330]" style={{ fontSize: '18px' }}>check_circle</span> 
                    AI Powered Visualizations
                  </li>
                </ul>
                <button 
                  onClick={() => onAuthAction('login')}
                  className="mt-8 px-8 py-4 bg-[#954330] text-white font-bold rounded-lg shadow-lg hover:bg-[#b45b46] transition-all flex items-center justify-center gap-2"
                >
                  Open Agent Chat
                  <span className="material-symbols-outlined">smart_toy</span>
                </button>
              </div>
              <div className="lg:col-span-7">
                <div className="glass-card rounded-xl p-2 shadow-lg border border-[#e2e2e2] overflow-hidden cursor-pointer" onClick={() => onAuthAction('login')}>
                  <img 
                    alt="NEMOTRON-NANO Architecture Diagram" 
                    className="w-full h-auto rounded-lg" 
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuDTxW6TeqSeFnF9Kde5iY8Zb6UlwHUQni7d7jtpFm1YQDRjPWioStGg7KIcM0MBrrTy-P2fofhC48gaUXoZbN_rFbKNTwlqI0p4dxOYxyp8p-YKKz0U5e5O18KJMve8Ov4tDt5SOvnFiz_scuv1k5-BhPxnsC082Pa3kKs9UxLw14Pq5DehI_-CmXUvOlCxe7eYMdYSxWUH4cs4SFUBOeilZOF8fU6PW2tUKMfYgWx8KS42xqQ3Jw__GCF5JN8SsMTa5wERCDwaggs" 
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Bento Grid */}
        <section className="bg-[#ffffff] py-12">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-8">
              <h2 className="text-[32px] md:text-[36px] font-bold text-[#1a1c1c] mb-4 font-headline-xl">Master the Global Knowledge Graph</h2>
              <p className="text-[16px] text-[#5f5e5e] font-body-lg">Advanced tools designed for the modern researcher to accelerate discovery and minimize friction.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Trending Paper Feed */}
              <div 
                onClick={() => onAuthAction('login')}
                className="md:col-span-7 bg-[#f9f9f9] border border-[#e2e2e2] rounded-xl overflow-hidden flex flex-col group hover:border-[#954330] transition-colors cursor-pointer"
              >
                <div className="border-b border-[#e2e2e2] flex justify-between items-center bg-[#f9f9f9] p-4">
                  <h3 className="font-bold text-[18px] text-[#954330] flex items-center gap-2 font-headline-md">
                    <span className="material-symbols-outlined">trending_up</span>
                    Trending Paper Feed
                  </h3>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 bg-[#e8e8e8] rounded text-[12px] font-semibold font-body-sm">Today</span>
                    <span className="px-2 py-1 bg-[#954330] text-white rounded text-[12px] font-semibold font-body-sm">Live</span>
                  </div>
                </div>
                <div className="flex-grow p-4 relative overflow-hidden h-60">
                  <img 
                    alt="Trending Feed" 
                    className="w-full h-full object-cover object-top group-hover:scale-[1.02] transition-transform duration-700" 
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCvsgb9CSBqdlYSloHaqVl9lbByLyZBKldWS5WPcr17O6LqsLYqBbivACySPdDdNgjFDmsL4cMgEk4GMTqzzXk8cEWWltCtEcDzP_6ux24L38vDkFpPL47xg1IVyjcxDxIMnTZrAL8Uae7sPBXCsxo4f_X12B0O6jzsS6dRDbR5DEzytN1L3xkS1-3qYn9hdVvcQjvRdenMrSwoxsRg-hODKqE-0XQONS9oKNeoEWbcnJN7YehZR9vLRKeinXZE6gsImyNekls6Zsc" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#f9f9f9] via-transparent to-transparent opacity-40"></div>
                </div>
                <div className="bg-[#f9f9f9] p-4 border-t border-[#e2e2e2]">
                  <p className="text-sm text-[#5f5e5e] italic font-body-md">"Stay ahead of the curve with our proprietary velocity tracking on recent pre-prints."</p>
                </div>
              </div>

              {/* AI-Powered Deep Dives & Math Insights */}
              <div className="md:col-span-5 flex flex-col gap-6">
                <div 
                  onClick={() => onAuthAction('login')}
                  className="flex-grow bg-[#f9f9f9] border border-[#e2e2e2] rounded-xl flex flex-col justify-center items-center text-center space-y-4 hover:shadow-xl transition-all border-l-4 border-l-[#954330] p-6 cursor-pointer"
                >
                  <div className="w-16 h-16 rounded-full bg-[#ffdad2] flex items-center justify-center mb-2">
                    <span className="material-symbols-outlined text-[#954330] text-3xl" style={{ fontVariationSettings: '"FILL" 1' }}>science</span>
                  </div>
                  <h3 className="text-[18px] font-bold font-headline-md">AI-Powered Deep Dives</h3>
                  <p className="text-sm text-[#5f5e5e] font-body-md">Convert complex formulas and dense paragraphs into digestible insights instantly.</p>
                  <div className="w-full h-40 rounded-lg bg-[#e8e8e8] border border-[#e2e2e2] overflow-hidden">
                    <img 
                      alt="Mathematical Insight" 
                      className="w-full h-full object-cover grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-500" 
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuCgyr9W39E7sLm7bLfAslvFcTaqgUDLQZS_WH2uZrzWGkvUIIKCFH9lzfoUNnEtBqB1Nl2RjrAJgkMcX61_JHeKbNHXjViUkpRDqMQVpRPLSrgcu5hlUlnnm0fTlbJdoL4cKrNkl4b_xl5m94JfkgNXX5qmqyYUBj_isM4D4VT2KeQJFVCjUmg8iBA0uVM7x8wn2x0TmbfUtKxZeUphU7sUQVoCReMeSEwECn-gt1srJshjlRrgocAtdhodVoJn9ywUNTP7eOaD-Ag" 
                    />
                  </div>
                </div>
                
                <div 
                  onClick={() => onAuthAction('signup')}
                  className="bg-[#954330] text-[#fffbff] rounded-xl relative overflow-hidden group p-6 cursor-pointer"
                >
                  <div className="relative z-10">
                    <h3 className="text-[18px] font-bold font-headline-md mb-2">Mathematical Insights</h3>
                    <p className="text-sm opacity-90 font-body-sm">Our agent parses LaTeX and provides step-by-step proofs for complex theorems found in any paper.</p>
                  </div>
                  <span className="material-symbols-outlined absolute -bottom-6 -right-6 text-9xl opacity-10 group-hover:rotate-12 transition-transform duration-500">functions</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="py-12 border-t border-[#dbc1bb] bg-[#f9f9f9]">
          <div className="max-w-5xl mx-auto px-6 text-center">
            <h2 className="text-[32px] md:text-[36px] font-bold text-[#1a1c1c] mb-4 font-headline-xl">Ready to accelerate your research?</h2>
            <p className="text-[16px] text-[#5f5e5e] mb-8 max-w-2xl mx-auto font-body-lg">Join thousands of researchers using our AI agent to synthesize the global knowledge graph in real-time.</p>
            <div className="flex justify-center">
              <button 
                onClick={() => onAuthAction('signup')}
                className="px-10 py-4 bg-[#954330] text-white font-bold rounded-lg shadow-lg hover:bg-[#b45b46] transition-all flex items-center justify-center gap-2 group"
              >
                Get Started with the Agent Today
                <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#f3f3f3] border-t border-[#dbc1bb] py-12">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 w-full">
            <div className="space-y-4">
              <img 
                alt="Saraswati Research" 
                className="h-10 w-auto object-contain" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCPKTJ6ywlAWnZfF5w12lV6dPj1V-TT0G05OzX3zUJuHAl2_gcRM_Pf3VtrMZgL5CME7HuGvhTNaJDjhKxlhmFk63efIJ4x90wU7x8Ea9qDqTeQ1EV8eTesPF9GcbUnkCQk3bhPidO1feoeRAlnI5nxX65YwWfN8KUJwjEE7biCKFKd3rAltGY30z1O6jaa98Xm0q7hCe07QzZmHyslGF6HaDhM979bp8_iQpsaerXkTjnmfkGDlPz6-WxP2tCjI8Pt78oPRICVYyo" 
              />
              <p className="text-sm text-[#5f5e5e] max-w-xs font-body-md">
                Building the intelligent infrastructure for global scientific progress.
              </p>
            </div>
            <span className="text-sm text-[#5f5e5e] font-body-sm">© 2026 Saraswati Research. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
