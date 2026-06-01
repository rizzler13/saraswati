// Netlify serverless function - proxies research queries to Groq API
// Set GROQ_API_KEY in Netlify dashboard environment variables

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = Netlify.env.get('GROQ_API_KEY')
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GROQ_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body = await req.json()
    const { messages } = body

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'messages array required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const groqRes = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages,
          temperature: 0.4,
          max_tokens: 2048,
        }),
      }
    )

    if (!groqRes.ok) {
      const err = await groqRes.text()
      return new Response(
        JSON.stringify({ error: `Groq API error: ${err}` }),
        { status: groqRes.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const data = await groqRes.json()
    const content = data.choices?.[0]?.message?.content || ''

    return new Response(
      JSON.stringify({ content }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export const config = {
  path: '/.netlify/functions/research',
}
