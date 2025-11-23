import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server API Key not configured' });
  }

  const { text, language } = req.body;
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Construct system instruction based on language
    let systemInstruction = "You are Narada, the divine sage and devotee guide for Tirumala. Answer questions about the temple, rituals, and places with devotion and humility.";
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
        // Using Google Maps tool to provide location data if relevant
        tools: [{ googleMaps: {} }],
      }
    });

    const generatedText = response.text;
    
    // Extract map link if available from grounding metadata
    let mapLink = undefined;
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
        const mapChunk = chunks.find(c => c.maps?.uri);
        if (mapChunk) mapLink = mapChunk.maps.uri;
    }

    res.status(200).json({ text: generatedText, mapLink });
  } catch (error) {
    console.error('Narada API Error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
}
