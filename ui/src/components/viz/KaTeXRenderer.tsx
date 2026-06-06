/**
 * KaTeX renderer for LaTeX equations.
 * Handles both inline ($...$) and display ($$...$$) math.
 */
import { useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

interface KaTeXProps {
  latex: string
  display?: boolean
}

export function KaTeXRenderer({ latex, display = true }: KaTeXProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || !latex) return
    try {
      katex.render(latex, ref.current, {
        displayMode: display,
        throwOnError: false,
        trust: true,
        strict: false,
      })
    } catch (e) {
      console.warn('KaTeX render error:', e)
      if (ref.current) {
        ref.current.textContent = latex
      }
    }
  }, [latex, display])

  return <div ref={ref} className={display ? 'dd-katex-display' : 'dd-katex-inline'} />
}

/**
 * Renders text with mixed prose and LaTeX.
 * Splits on $...$ (inline) and $$...$$ (display) delimiters.
 */
export function MixedMathRenderer({ text }: { text: string }) {
  if (!text) return null

  const mathBlocks: { type: 'inline' | 'display'; value: string }[] = []
  let placeholderCounter = 0
  let tokenizedText = text

  // Extract display math ($$...$$ and \[...\])
  tokenizedText = tokenizedText.replace(/\$\$([\s\S]*?)\$\$/g, (_match, p1) => {
    const placeholder = `__MATH_DISPLAY_${placeholderCounter}__`
    mathBlocks[placeholderCounter] = { type: 'display', value: p1 }
    placeholderCounter++
    return placeholder
  })
  tokenizedText = tokenizedText.replace(/\\\[([\s\S]*?)\\\]/g, (_match, p1) => {
    const placeholder = `__MATH_DISPLAY_${placeholderCounter}__`
    mathBlocks[placeholderCounter] = { type: 'display', value: p1 }
    placeholderCounter++
    return placeholder
  })

  // Extract inline math ($...$ and \(...\))
  tokenizedText = tokenizedText.replace(/\$([^\$\n]+?)\$/g, (_match, p1) => {
    const placeholder = `__MATH_INLINE_${placeholderCounter}__`
    mathBlocks[placeholderCounter] = { type: 'inline', value: p1 }
    placeholderCounter++
    return placeholder
  })
  tokenizedText = tokenizedText.replace(/\\\(([\s\S]*?)\\\)/g, (_match, p1) => {
    const placeholder = `__MATH_INLINE_${placeholderCounter}__`
    mathBlocks[placeholderCounter] = { type: 'inline', value: p1 }
    placeholderCounter++
    return placeholder
  })

  // Split and render
  const regex = /(__MATH_(?:INLINE|DISPLAY)_\d+__)/g
  const parts = tokenizedText.split(regex)

  return (
    <span>
      {parts.map((part, index) => {
        const match = part.match(/__MATH_(INLINE|DISPLAY)_(\d+)__/)
        if (match) {
          const type = match[1].toLowerCase() as 'inline' | 'display'
          const id = parseInt(match[2], 10)
          const mathVal = mathBlocks[id].value
          return <KaTeXRenderer key={index} latex={mathVal} display={type === 'display'} />
        }
        return <span key={index}>{part}</span>
      })}
    </span>
  )
}

/**
 * Renders text with block-level markdown and KaTeX equations.
 */
export function MarkdownMathRenderer({ text }: { text: string }) {
  if (!text) return null

  // 1. Extract math blocks and replace with placeholders
  const mathBlocks: { type: 'inline' | 'display'; value: string }[] = []
  let placeholderCounter = 0
  
  let tokenizedText = text
  
  // Extract display math ($$...$$ and \[...\])
  tokenizedText = tokenizedText.replace(/\$\$([\s\S]*?)\$\$/g, (_match, p1) => {
    const placeholder = `__MATH_DISPLAY_${placeholderCounter}__`
    mathBlocks[placeholderCounter] = { type: 'display', value: p1 }
    placeholderCounter++
    return placeholder
  })
  tokenizedText = tokenizedText.replace(/\\\[([\s\S]*?)\\\]/g, (_match, p1) => {
    const placeholder = `__MATH_DISPLAY_${placeholderCounter}__`
    mathBlocks[placeholderCounter] = { type: 'display', value: p1 }
    placeholderCounter++
    return placeholder
  })
  
  // Extract inline math ($...$ and \(...\))
  tokenizedText = tokenizedText.replace(/\$([^\$\n]+?)\$/g, (_match, p1) => {
    const placeholder = `__MATH_INLINE_${placeholderCounter}__`
    mathBlocks[placeholderCounter] = { type: 'inline', value: p1 }
    placeholderCounter++
    return placeholder
  })
  tokenizedText = tokenizedText.replace(/\\\(([\s\S]*?)\\\)/g, (_match, p1) => {
    const placeholder = `__MATH_INLINE_${placeholderCounter}__`
    mathBlocks[placeholderCounter] = { type: 'inline', value: p1 }
    placeholderCounter++
    return placeholder
  })

  // Helper to substitute placeholders back and parse inline formatting
  const renderInlineWithMath = (str: string): React.ReactNode[] => {
    const regex = /(__MATH_(?:INLINE|DISPLAY)_\d+__)/g
    const parts = str.split(regex)
    
    return parts.flatMap((part, index) => {
      const match = part.match(/__MATH_(INLINE|DISPLAY)_(\d+)__/)
      if (match) {
        const type = match[1].toLowerCase() as 'inline' | 'display'
        const id = parseInt(match[2], 10)
        const mathVal = mathBlocks[id].value
        return <KaTeXRenderer key={index} latex={mathVal} display={type === 'display'} />
      }
      
      // Inline markdown parsing on plain text (bold **, italic *, code `)
      const inlineRegex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g
      const inlineParts = part.split(inlineRegex)
      return inlineParts.map((subPart, subIdx) => {
        const key = `${index}-${subIdx}`
        if (subPart.startsWith('**') && subPart.endsWith('**')) {
          return <strong key={key}>{subPart.slice(2, -2)}</strong>
        }
        if (subPart.startsWith('*') && subPart.endsWith('*')) {
          return <em key={key}>{subPart.slice(1, -1)}</em>
        }
        if (subPart.startsWith('`') && subPart.endsWith('`')) {
          return <code key={key} className="inline-code">{subPart.slice(1, -1)}</code>
        }
        return <span key={key}>{subPart}</span>
      })
    })
  }

  // 2. Parse block level (headings, paragraphs, lists, code blocks)
  const lines = tokenizedText.split('\n')
  
  interface Block {
    type: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'ul' | 'ol' | 'spacer' | 'code'
    content: string | string[]
    language?: string
  }

  const blocks: Block[] = []
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null
  let inCodeBlock = false
  let codeLines: string[] = []
  let codeLanguage = ''

  for (const line of lines) {
    const trimmed = line.trim()

    // Check code block tag
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        blocks.push({ type: 'code', content: codeLines.join('\n'), language: codeLanguage })
        codeLines = []
        codeLanguage = ''
        inCodeBlock = false
      } else {
        if (currentList) {
          blocks.push({ type: currentList.type, content: currentList.items })
          currentList = null
        }
        codeLanguage = trimmed.slice(3).trim()
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    if (!trimmed) {
      if (currentList) {
        blocks.push({ type: currentList.type, content: currentList.items })
        currentList = null
      }
      blocks.push({ type: 'spacer', content: '' })
      continue
    }

    // Check unordered list item
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      const itemText = trimmed.slice(2)
      if (currentList && currentList.type === 'ul') {
        currentList.items.push(itemText)
      } else {
        if (currentList) {
          blocks.push({ type: currentList.type, content: currentList.items })
        }
        currentList = { type: 'ul', items: [itemText] }
      }
      continue
    }

    // Check ordered list item
    const numListMatch = trimmed.match(/^(\d+)\.\s(.*)/)
    if (numListMatch) {
      const itemText = numListMatch[2]
      if (currentList && currentList.type === 'ol') {
        currentList.items.push(itemText)
      } else {
        if (currentList) {
          blocks.push({ type: currentList.type, content: currentList.items })
        }
        currentList = { type: 'ol', items: [itemText] }
      }
      continue
    }

    // If it's not a list item, flush any current list
    if (currentList) {
      blocks.push({ type: currentList.type, content: currentList.items })
      currentList = null
    }

    // Headings
    if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', content: trimmed.slice(2) })
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', content: trimmed.slice(3) })
    } else if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', content: trimmed.slice(4) })
    } else if (trimmed.startsWith('#### ')) {
      blocks.push({ type: 'h4', content: trimmed.slice(5) })
    } else {
      // Normal paragraph
      blocks.push({ type: 'p', content: line })
    }
  }

  // Flush any final list or code block
  if (inCodeBlock) {
    blocks.push({ type: 'code', content: codeLines.join('\n'), language: codeLanguage })
  } else if (currentList) {
    blocks.push({ type: currentList.type, content: currentList.items })
  }

  return (
    <div className="markdown-body">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'spacer':
            return <div key={i} style={{ height: '8px' }} />
          case 'h1':
            return <h1 key={i}>{renderInlineWithMath(block.content as string)}</h1>
          case 'h2':
            return <h2 key={i}>{renderInlineWithMath(block.content as string)}</h2>
          case 'h3':
            return <h3 key={i}>{renderInlineWithMath(block.content as string)}</h3>
          case 'h4':
            return <h4 key={i}>{renderInlineWithMath(block.content as string)}</h4>
          case 'p':
            return <p key={i}>{renderInlineWithMath(block.content as string)}</p>
          case 'ul':
            return (
              <ul key={i}>
                {(block.content as string[]).map((item, idx) => (
                  <li key={idx} className="md-li">
                    {renderInlineWithMath(item)}
                  </li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={i} style={{ paddingLeft: '20px' }}>
                {(block.content as string[]).map((item, idx) => (
                  <li key={idx} className="md-li" style={{ listStyleType: 'decimal' }}>
                    {renderInlineWithMath(item)}
                  </li>
                ))}
              </ol>
            )
          case 'code':
            return (
              <pre key={i} className="code-block-container" style={{
                background: 'var(--bg-secondary)', color: 'var(--text-body)', padding: '16px 20px',
                borderRadius: '8px', overflowX: 'auto', fontFamily: 'var(--font-mono)',
                fontSize: '13px', margin: '14px 0', border: '1px solid var(--border)',
                position: 'relative'
              }}>
                {block.language && (
                  <div style={{
                    position: 'absolute', right: '14px', top: '8px',
                    fontSize: '10px', textTransform: 'uppercase', color: 'var(--accent-primary)',
                    background: 'rgba(201, 85, 58, 0.06)', padding: '2px 8px',
                    borderRadius: '4px', border: '1px solid rgba(201, 85, 58, 0.1)',
                    fontWeight: 600, letterSpacing: '0.8px'
                  }}>
                    {block.language}
                  </div>
                )}
                <code style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'pre', display: 'block', lineHeight: 1.5 }}>
                  {block.content}
                </code>
              </pre>
            )
          default:
            return null
        }
      })}
    </div>
  )
}