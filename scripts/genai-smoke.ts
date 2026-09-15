import 'dotenv/config'
import { GoogleGenAI } from '@google/genai'

async function main(): Promise<void> {
  const project = process.env.VERTEX_AI_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID
  const location = process.env.VERTEX_AI_LOCATION ?? 'us-central1'
  const model = process.env.VERTEX_AI_MODEL ?? 'gemini-2.0-flash'
  if (!project) throw new Error('Sin VERTEX_AI_PROJECT_ID/FIREBASE_PROJECT_ID')

  console.log('Config:', JSON.stringify({ project, location, model }))

  const ai = new GoogleGenAI({ vertexai: true, project, location })
  const result = await ai.models.generateContent({
    model,
    contents: 'Responde únicamente con la palabra OK',
    config: { maxOutputTokens: 10 },
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
