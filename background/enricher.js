// background/enricher.js — Claude API enrichment for raw capsule data

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/**
 * Extracts the first balanced top-level JSON object ({ ... }) from a string that
 * may contain surrounding prose or markdown code fences. Returns the object
 * substring, or null if none is found. Quotes and escapes are tracked so braces
 * inside string values don't corrupt the depth count.
 *
 * @param {string} text
 * @returns {string|null}
 */
function extractJsonObject(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = inString;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

/**
 * Enriches a capsule by sending its raw conversation to Claude API
 * for structured extraction (title, summary, goals, constraints, stack, keyDecisions).
 *
 * @param {Object} capsule - The raw capsule to enrich
 * @returns {Promise<Object>} The enriched capsule (or original on failure)
 */
export async function enrichCapsule(capsule) {
  try {
    const settingsObj = await chrome.storage.sync.get('kairo_settings');
    const enrichEngine = settingsObj.kairo_settings?.enrichEngine || 'claude';
    const claudeApiKey = settingsObj.kairo_settings?.apiKey;
    const geminiApiKey = settingsObj.kairo_settings?.geminiApiKey;
    const autoTag = settingsObj.kairo_settings?.autoTag === true;

    if (enrichEngine === 'claude' && !claudeApiKey) {
      console.warn('[Kairo Enricher] No Claude API key configured — skipping enrichment');
      return capsule;
    }
    if (enrichEngine === 'gemini' && !geminiApiKey) {
      console.warn('[Kairo Enricher] No Gemini API key configured — skipping enrichment');
      return capsule;
    }

    const rawText =
      capsule.content.rawSnippet ||
      capsule.content.rawTurns
        ?.map((t) => `[${t.role}]: ${t.text}`)
        .join('\n\n')
        .slice(-4000) ||
      '';

    if (!rawText.trim()) {
      console.warn('[Kairo Enricher] No raw content to enrich');
      return capsule;
    }

    const prompt = `
You are a context extraction assistant for Kairo — a tool that saves AI chat context.
Given this AI conversation, extract:
- title: A short descriptive title (max 8 words)
- summary: A 2-3 sentence summary of what the user is building or working on
- goals: Array of specific goals the user mentioned
- constraints: Array of any technical or business constraints mentioned
- stack: Array of technologies, frameworks, or tools mentioned
- keyDecisions: Array of any decisions or conclusions reached
- tags: Array of 2-4 short, relevant tags (lowercase, e.g. ["react", "auth", "bug-fix"]) based on the technology or topic of the conversation

Respond ONLY with valid JSON matching this shape:
{ "title": "", "summary": "", "goals": [], "constraints": [], "stack": [], "keyDecisions": [], "tags": [] }

Conversation:
${rawText}
    `.trim();

    let text = '{}';

    if (enrichEngine === 'gemini') {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }),
        },
      );

      if (!response.ok) {
        console.error('[Kairo Enricher] Gemini API error:', response.status, response.statusText);
        return capsule;
      }

      const data = await response.json();
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    } else {
      const apiEndpoint =
        settingsObj.kairo_settings?.apiEndpoint || 'https://api.anthropic.com/v1/messages';
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01',
          // Required for the Anthropic API to accept requests from a non-server
          // origin (the extension's chrome-extension:// origin in MV3).
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: 800,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        console.error('[Kairo Enricher] Claude API error:', response.status, response.statusText);
        return capsule;
      }

      const data = await response.json();
      text = data.content?.[0]?.text || '{}';
    }

    // Models sometimes wrap the JSON in prose or code fences; extract the first
    // balanced { ... } object instead of assuming the whole reply is JSON.
    const jsonText = extractJsonObject(text);
    if (!jsonText) {
      console.warn('[Kairo Enricher] No JSON object found in model response:', text);
      return capsule;
    }

    let enriched;
    try {
      enriched = JSON.parse(jsonText);
    } catch (parseErr) {
      console.warn('[Kairo Enricher] Failed to parse JSON from model response:', text, parseErr);
      return capsule;
    }

    console.log('[Kairo Enricher] Successfully enriched capsule:', enriched.title);

    return {
      ...capsule,
      title: enriched.title || capsule.title,
      content: {
        ...capsule.content,
        summary: enriched.summary || capsule.content.summary,
        goals: enriched.goals || capsule.content.goals,
        constraints: enriched.constraints || capsule.content.constraints,
        stack: enriched.stack || capsule.content.stack,
        keyDecisions: enriched.keyDecisions || capsule.content.keyDecisions,
      },
      meta: {
        ...capsule.meta,
        enriched: true,
        tags:
          autoTag && Array.isArray(enriched.tags)
            ? Array.from(new Set([...(capsule.meta?.tags || []), ...enriched.tags]))
            : capsule.meta?.tags || [],
      },
    };
  } catch (err) {
    console.error('[Kairo Enricher] Enrichment failed:', err);
    return capsule;
  }
}
