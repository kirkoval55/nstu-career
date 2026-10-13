// Серверная функция-посредник между сайтом и Claude API.
// Ключ хранится только на сервере (переменная окружения ANTHROPIC_API_KEY).
const H = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const out = (code, obj) => ({ statusCode: code, headers: H, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return out(405, { error: 'method' });
  const allowed = process.env.ALLOWED_ORIGIN;
  if (allowed && (event.headers.origin || '') !== allowed) return out(403, { error: 'origin' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return out(400, { error: 'json' }); }
  const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-12).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 8000)
  }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return out(400, { error: 'messages' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-5-5',
        max_tokens: 600,
        messages: msgs
      })
    });
    const j = await r.json();
    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return out(r.ok ? 200 : 502, { text });
  } catch (e) {
    return out(502, { error: 'upstream' });
  }
};
