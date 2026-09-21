import { callGemini } from '@/lib/gemini'

// a scanned page yields little or no extractable text, that's when OCR is worth trying
export const MIN_EXTRACTED_TEXT_LENGTH = 40

export function needsOcr(extractedText: string): boolean {
  return extractedText.trim().length < MIN_EXTRACTED_TEXT_LENGTH
}

const OCR_PROMPT =
  'Transcribe all text in this document, in reading order. ' +
  'Return only the transcribed text, with no commentary. ' +
  'If the document contains no readable text, return nothing.'

// gemini reads the pages as images, so this works on scans that hold no text layer
export async function ocrPdf(buffer: Buffer): Promise<string> {
  const res = await callGemini('generateContent', {
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: buffer.toString('base64') } },
          { text: OCR_PROMPT },
        ],
      },
    ],
  })

  if (!res.ok) {
    throw new Error(`OCR failed (${res.status}): ${await res.text()}`)
  }

  const data = await res.json()
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
}
