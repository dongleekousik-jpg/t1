import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  // Handle CORS for Vercel if necessary (usually handled by rewrite, but good safety)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Robust API Key check: Try common names
  const apiKey = process.env.API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("CRITICAL: API Key missing in Vercel Environment Variables.");
    return res.status(500).json({ 
      error: 'Server Configuration Error', 
      details: 'API_KEY is missing in Vercel Environment Variables. Please add it in Settings.' 
    });
  }

  const { text, language } = req.body;
  
  if (!text) {
     return res.status(400).json({ error: 'No text provided' });
  }
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Construct system instruction based on language
    let systemInstruction = "You are Narada, the divine sage and devotee guide for Tirumala. Answer questions about the temple, rituals, and places with devotion and humility. Keep answers concise (under 100 words) to ensure quick responses. If the user asks about location, use the map tool.";
    if (language === 'te') systemInstruction += " Reply in Telugu.";
    else if (language === 'hi') systemInstruction += " Reply in Hindi.";
    else if (language === 'ta') systemInstruction += " Reply in Tamil.";
    else if (language === 'kn') systemInstruction += " Reply in Kannada.";
    else systemInstruction += " Reply in English.";

    // Use Gemini 2.5 Flash for chat
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: text,
      config: {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 300, // Limit output to prevent timeouts
        // Disable safety settings to prevent blocking religious content (false positives)
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
        // Using Google Maps tool to provide location data
        tools: [{ googleMaps: {} }],
      }
    });

    const generatedText = response.text;
    
    if (!generatedText) {
        throw new Error("Empty response from AI model");
    }
    
    // Extract map link if available from grounding metadata
    let mapLink = undefined;
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
        const mapChunk = chunks.find(c => c.maps?.uri);
        if (mapChunk) mapLink = mapChunk.maps.uri;
    }

    // Extract web links if available
    let webLinks = undefined;
    if (chunks) {
        const webChunks = chunks.filter(c => c.web?.uri);
        if (webChunks.length > 0) {
            webLinks = webChunks.map(c => ({ title: c.web.title || 'Source', uri: c.web.uri }));
        }
    }

    res.status(200).json({ text: generatedText, mapLink, webLinks });
  } catch (error) {
    console.error('Narada API Error:', error);
    // Return the actual error message for debugging purposes
    res.status(500).json({ error: 'Failed to generate response', details: error.message });
  }
}