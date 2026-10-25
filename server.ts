import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Support high-resolution comic images without downscaling or compression (up to 30MB)
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Configured Gemma 4 Model Identifier (ensures valid Gemma 4 identifier)
const CONFIGURED_GEMMA_MODEL =
  process.env.GEMMA_MODEL && process.env.GEMMA_MODEL.includes('gemma')
    ? process.env.GEMMA_MODEL
    : 'gemma-4-26b-a4b-it';

// Verbatim OCR & Accessibility Analysis Prompt
const ANALYSIS_PROMPT = `You are ComicLens, an assistive accessibility workbench that drafts precise descriptions and verbatim transcripts for comic pages (such as Franco-Belgian ligne claire like Tintin, American comic books, manga, and graphic novels).

Analyze the supplied comic page image with maximum attention to visual details and verbatim text transcription.

CRITICAL OCR & TRANSCRIPTION RULES:
1. Provide two strictly separated outputs for every identified panel:
   A. "visual_description": A detailed, objective visual description of characters, actions, postures, settings, expressions, and key props.
   B. "verbatim_transcription": An exact, word-for-word, letter-for-letter transcription of ALL readable text in the panel.
2. Under "verbatim_transcription", categorize and transcribe every piece of text:
   - Speech bubbles: identify the speaker or location if clear, followed by the exact quoted words.
   - Narration captions / caption boxes: transcribe verbatim.
   - In-scene signs / labels / documents: transcribe visible lettering.
   - Sound effects (onomatopoeia): transcribe exact spelling (e.g., "TAP! TAP! TAP!").
3. DO NOT PARAPHRASE dialogue. Transcribe the exact words as lettered.
4. DO NOT INVENT missing words or attempt to "smooth out" incomplete or stylized grammar.
5. DO NOT silently correct uncertain, damaged, or stylized lettering.
6. If any word or letter is faint, cropped, or partially illegible:
   - Transcribe what is confident and use "[unclear]" or "[?]" for doubtful portions.
   - Explicitly describe the ambiguity in the "uncertainty" field rather than guessing.
7. Keep visual descriptions completely distinct from dialogue transcripts.
8. If no text exists in a panel, set "verbatim_transcription" to "".

Return one JSON object with this exact structure:
{
  "page_summary": "A concise summary of the overall visible page.",
  "reading_order_note": "A short note about the inferred reading sequence and any layout ambiguity.",
  "panels": [
    {
      "sequence": 1,
      "visual_description": "Objective description of characters, actions, settings, and visual storytelling.",
      "verbatim_transcription": "Exact letter-for-letter transcript of speech bubbles, captions, and sound effects.",
      "uncertainty": "Specific text or visual uncertainties, or empty string."
    }
  ],
  "overall_uncertainties": [
    "Any important unresolved page-level ambiguity."
  ]
}

Return valid JSON only, without Markdown fences or conversational commentary.`;

// API status & configuration endpoint
app.get('/api/config', (_req: Request, res: Response) => {
  res.json({
    model: CONFIGURED_GEMMA_MODEL,
    hasApiKey: !!process.env.GEMINI_API_KEY,
    imageDetail: 'MEDIA_RESOLUTION_HIGH',
  });
});

// Server-side Gemma 4 Comic Analysis endpoint
app.post('/api/analyze', async (req: Request, res: Response) => {
  const { imageBase64, mimeType, model } = req.body;

  if (!imageBase64) {
    return res.status(400).json({
      success: false,
      error: 'No image data provided. Please upload a comic page image.',
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: 'GEMINI_API_KEY is not configured on the server. Please set GEMINI_API_KEY in .env.',
    });
  }

  // Use requested model or fall back to configured Gemma 4 model
  const targetModel = model || CONFIGURED_GEMMA_MODEL;

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Clean base64 payload supporting data URLs (base64 or utf8 encoded)
    let cleanBase64 = imageBase64;
    let detectedMime = mimeType || 'image/png';

    if (typeof imageBase64 === 'string' && imageBase64.startsWith('data:')) {
      if (imageBase64.includes(';base64,')) {
        const parts = imageBase64.split(';base64,');
        detectedMime = parts[0].replace('data:', '');
        cleanBase64 = parts[1];
      } else {
        const commaIdx = imageBase64.indexOf(',');
        const header = imageBase64.substring(0, commaIdx);
        const rawContent = decodeURIComponent(imageBase64.substring(commaIdx + 1));
        detectedMime = header.replace('data:', '').replace(';utf8', '');
        cleanBase64 = Buffer.from(rawContent, 'utf8').toString('base64');
      }
    }

    // Call Gemma 4 with high visual-token resolution for small text recognition
    // and low temperature to prevent hallucination/paraphrasing
    const callConfig = {
      model: targetModel,
      contents: [
        {
          inlineData: {
            mimeType: detectedMime,
            data: cleanBase64,
          },
        },
        ANALYSIS_PROMPT,
      ],
      config: {
        responseMimeType: 'application/json',
        mediaResolution: 'MEDIA_RESOLUTION_HIGH',
        temperature: 0.1,
      },
    };

    let response;
    try {
      response = await ai.models.generateContent(callConfig);
    } catch (err: any) {
      if (err?.message?.includes('500') || err?.message?.includes('INTERNAL')) {
        await new Promise((r) => setTimeout(r, 1200));
        response = await ai.models.generateContent(callConfig);
      } else {
        throw err;
      }
    }

    const rawText = response.text || '';
    if (!rawText.trim()) {
      return res.status(502).json({
        success: false,
        error: 'The model returned an empty response.',
      });
    }

    res.json({
      success: true,
      model: targetModel,
      imageDetail: 'MEDIA_RESOLUTION_HIGH',
      rawText,
    });
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.error('Server Gemma 4 API error:', errorMsg);

    let clientMessage = errorMsg;
    if (errorMsg.includes('404') || errorMsg.toLowerCase().includes('not found')) {
      clientMessage = `Model '${targetModel}' was not found or is unavailable to your API key.`;
    } else if (errorMsg.includes('403') || errorMsg.toLowerCase().includes('permission')) {
      clientMessage = 'Authentication failure: The server GEMINI_API_KEY is invalid or lacks necessary permissions.';
    } else if (errorMsg.includes('429') || errorMsg.toLowerCase().includes('quota')) {
      clientMessage = 'API quota exhausted or rate limit exceeded. Please wait a moment before retrying.';
    }

    res.status(500).json({
      success: false,
      error: clientMessage,
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ComicLens server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
