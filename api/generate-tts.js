import { GoogleGenAI, Modality } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API Key missing");
    return res.status(500).json({ error: 'Server API Key not configured' });
  }

  let { text } = req.body;
  
  if (!text) {
      return res.status(400).json({ error: 'No text provided' });
  }

  // Optimize text length for speed and timeout prevention
  // Gemini TTS can handle more, but Vercel functions have a 10s limit on free tier
  if (text.length > 400) {
      const parts = text.split('.');
      let truncated = "";
      for (const part of parts) {
          if ((truncated.length + part.length) < 400) {
              truncated += part + ".";
          } else {
              break;
          }
      }
      text = truncated || text.substring(0, 400); // Fallback if split fails
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Use Gemini 2.5 Flash TTS model
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
        },
        // Disable safety settings to prevent blocking religious texts
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
        console.error("Model returned no audio data. Candidates:", JSON.stringify(response.candidates));
        throw new Error("No audio data returned from model");
    }

    res.status(200).json({ base64Audio });
  } catch (error) {
    console.error('TTS API Error:', error);
    res.status(500).json({ error: 'Failed to generate speech', details: error.message });
  }
}