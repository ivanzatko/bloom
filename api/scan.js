// Vercel serverless function — proxies coffee scan to Anthropic API

const PROMPT = 'You are a specialty coffee expert. Analyze this photo (beans, grounds, brewed cup, or packaging/label). If you can see a label or packaging, identify the coffee name and roaster. Respond ONLY with a raw JSON object, no markdown fences:\n{"roast":"light"|"medium"|"dark","ratio":15|16|17,"grind":3.5,"grams":18,"coffeeName":"coffee name if visible on label","coffeeRoaster":"roaster name if visible on label","note":"short brewing tip in Slovak (1-2 sentences)"}';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const body = req.body || {};
  const image = body.image;
  const mime = body.mime;

  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing image (base64)' });
  }
  if (!mime || !mime.startsWith('image/')) {
    return res.status(400).json({ error: 'Invalid mime type' });
  }
  if (image.length > MAX_IMAGE_SIZE * 1.37) {
    return res.status(400).json({ error: 'Image too large (max 5MB)' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: image } },
            { type: 'text', text: PROMPT }
          ]
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(response.status).json({ error: data.error.message || 'Anthropic API error' });
    }

    const block = (data.content || []).find(function(b) { return b.type === 'text'; });
    if (!block) return res.status(500).json({ error: 'No response from AI' });

    const clean = block.text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({ error: 'Scan failed: ' + error.message });
  }
};
