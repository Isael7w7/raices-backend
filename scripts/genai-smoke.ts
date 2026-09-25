import 'dotenv/config'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'

async function main(): Promise<void> {
  const project = process.env.GEMINI_PROJECT_ID
    ?? process.env.VERTEX_AI_PROJECT_ID
    ?? process.env.FIREBASE_PROJECT_ID
  const location = process.env.GEMINI_LOCATION
    ?? process.env.VERTEX_AI_LOCATION
    ?? 'global'
  const model = process.env.GEMINI_MODEL
    ?? process.env.VERTEX_AI_MODEL
    ?? 'gemini-3.1-flash-lite'
  if (!project) throw new Error('Sin GEMINI_PROJECT_ID/VERTEX_AI_PROJECT_ID/FIREBASE_PROJECT_ID')

  console.log('Config:', JSON.stringify({ project, location, model }))

  const ai = new GoogleGenAI({ vertexai: true, project, location })
  const result = await ai.models.generateContent({
    model,
    contents: 'Responde únicamente con la palabra OK',
    // Gemini 3.x: thinking dinámico por defecto consume maxOutputTokens; se fija
    // MINIMAL para que la respuesta de 10 tokens no quede vacía.
    config: { maxOutputTokens: 64, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
  })

  const candidates = (result as any)?.candidates ?? (result as any)?.response?.candidates
  const parts = candidates?.[0]?.content?.parts
  const text = Array.isArray(parts)
    ? parts.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('')
    : ''
  console.log('RAW candidates[0] text:', JSON.stringify(text))
  if (!text) throw new Error('Respuesta vacía de Gemini')
  console.log('SMOKE OK')
}

main()
  .then(() => {
    console.log('SMOKE OK')
    process.exitCode = 0
  })
  .catch((e) => {
    console.error('SMOKE FAIL:', e?.message ?? e)
    process.exitCode = 1
  })
