
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { useLanguage } from '../App';
import { ChatMessage } from '../types';
import { Icon } from '../constants/icons';

const NaradaChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { t, language } = useLanguage();
  const chatPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: Date.now().toString(),
        sender: 'narada',
        text: t.narada.greeting
      }]);
    }
  }, [isOpen, t.narada.greeting, messages.length]);

  useEffect(() => {
    chatPanelRef.current?.scrollTo(0, chatPanelRef.current.scrollHeight);
  }, [messages]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setUserInput('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      const contents = `Current language is ${language}. User asks: "${text}"`;
          
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
            tools: [{googleSearch: {}}, {googleMaps: {}}],
            systemInstruction: `You are Narada, a wise and devotional guide for Tirumala and Tirupati pilgrims.

            CORE RESPONSIBILITIES:
            - Provide accurate, up-to-date information about Tirumala Tirupati Devasthanams (TTD).
            - Assist with Darshan timings, accommodation (CRO, Cottages), Sevas, and travel logistics within Tirupati/Tirumala.
            - Explain the spiritual significance of places like Srivari Temple, Papavinasanam, Akasha Ganga, etc.

            STRICT GUIDELINES:
            1. **ACCURACY IS PARAMOUNT**: 
               - For questions about **Darshan timings, Ticket availability, Special Entry Darshan (SED), Online Booking, or Current Crowd Status**, you MUST use the 'googleSearch' tool to find the latest official TTD updates.
               - Do not guess specific timings, prices, or rules if you are not sure; instead, state that you are checking the latest info.
            
            2. **SCOPE**: 
               - Answer ONLY regarding Tirumala, Tirupati, and related pilgrimage topics.
               - If asked about other topics, politely redirect the devotee to the sacred purpose of this app.

            3. **CONTEXTUAL UNDERSTANDING**: 
               - "Accommodation" or "Rooms" ALWAYS refers to TTD cottages/guest houses or hotels in Tirupati/Tirumala.
               - "Darshan" refers to Lord Venkateswara's darshan.

            4. **TONE & STYLE**: 
               - Address the user as "Devotee" or "Swami".
               - Be polite, humble, and helpful.
               - Keep answers **concise and direct** (max 3-4 sentences) unless a detailed procedure is asked.

            5. **LANGUAGE**: 
               - Respond in ${language}. If the query is in another language, adapt, but primarily use the requested language context.`
        },
      });
      
      const naradaText = response.text || "I am unable to formulate a response at this moment.";
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      
      let mapLink: string | undefined = undefined;
      const webLinks: { title: string; uri: string }[] = [];

      if (groundingChunks) {
          for (const chunk of groundingChunks) {
              if (chunk.maps) {
                  mapLink = chunk.maps.uri;
              }
              if (chunk.web) {
                  webLinks.push({ title: chunk.web.title || 'Source', uri: chunk.web.uri });
              }
          }
      }
      
      const naradaMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'narada',
        text: naradaText,
        mapLink: mapLink,
        webLinks: webLinks.length > 0 ? webLinks : undefined
      };
      setMessages((prev) => [...prev, naradaMessage]);

    } catch (error) {
      console.error('Error with Gemini API:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'narada',
        text: 'My apologies, devotee. I am having trouble connecting to the divine realms. Please try again later.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Using the vector logo (Icon) exclusively for reliability
  const Avatar = ({ className }: { className: string }) => (
  <img
    //src="https://raw.githubusercontent.com/kousik4215/tirupati-images/main/naradha.jpg"
    src="https://raw.githubusercontent.com/kousik4215/tirupati-images/main/Nrada%20rushi.jpg"
    alt="Narada Avatar"
    className={`${className} object-cover rounded-full`}
  />
);


  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-4 right-4 md:bottom-8 md:right-8 z-50 flex items-center bg-devotional-gold text-devotional-maroon rounded-full shadow-2xl hover:scale-105 transition-transform duration-300 ease-in-out border-2 border-devotional-maroon group pl-1 pr-6 py-1 gap-3`}
          aria-label={t.buttons.askNarada}
        >
          <div className="w-14 h-14 rounded-full border-2 border-devotional-maroon overflow-hidden bg-devotional-cream relative flex-shrink-0 group-hover:rotate-12 transition-transform duration-300">
             <Avatar className="w-full h-full" />
          </div>
          <span className={`font-bold font-serif-display text-lg whitespace-nowrap overflow-hidden max-w-[200px] opacity-100`}>
            {t.buttons.askNarada}
          </span>
        </button>
      )}

      {isOpen && (
        <div 
            className="fixed bottom-4 right-4 md:bottom-8 md:right-8 w-[90vw] max-w-sm h-[70vh] max-h-[600px] bg-white rounded-lg shadow-2xl flex flex-col z-50 border-2 border-devotional-maroon animate-fade-in-up"
        >
          <header className="flex items-center p-4 bg-devotional-maroon text-devotional-cream rounded-t-lg">
            <div className="w-10 h-10 rounded-full border-2 border-devotional-cream overflow-hidden mr-3 flex-shrink-0 bg-devotional-gold">
                <Avatar className="w-full h-full" />
            </div>
            <h3 className="font-bold text-lg">{t.narada.header}</h3>
            <button onClick={() => setIsOpen(false)} className="ml-auto text-2xl hover:text-devotional-gold transition-colors">&times;</button>
          </header>
          <div ref={chatPanelRef} className="flex-grow p-4 overflow-y-auto space-y-4 bg-devotional-cream/40">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.sender === 'narada' && (
                   <div className="w-8 h-8 rounded-full border border-devotional-maroon overflow-hidden mr-2 flex-shrink-0 mt-1 bg-devotional-gold">
                      <Avatar className="w-full h-full" />
                   </div>
                )}
                <div className={`max-w-[85%] px-4 py-2 rounded-lg shadow-sm ${msg.sender === 'user' ? 'bg-devotional-maroon text-devotional-cream' : 'bg-white text-devotional-text border border-devotional-gold/20'}`}>
                  <p className="whitespace-pre-wrap text-sm md:text-base">{msg.text}</p>
                  
                  {msg.mapLink && (
                    <a href={msg.mapLink} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 text-blue-600 hover:underline bg-gray-50 px-2 py-1 rounded text-xs font-bold border border-gray-200 block w-fit">
                      <Icon name="map" className="w-3 h-3" />
                      View on Map
                    </a>
                  )}

                  {msg.webLinks && msg.webLinks.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                        <span className="text-xs font-bold text-devotional-maroon/70">Sources:</span>
                        <div className="flex flex-wrap gap-2">
                            {msg.webLinks.map((link, idx) => (
                                <a key={idx} href={link.uri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100 hover:underline">
                                    <Icon name="link" className="w-3 h-3" />
                                    {link.title}
                                </a>
                            ))}
                        </div>
                    </div>
                  )}

                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start items-center">
                <div className="w-8 h-8 rounded-full border border-devotional-maroon overflow-hidden mr-2 flex-shrink-0 bg-devotional-gold">
                   <Avatar className="w-full h-full" />
                </div>
                <div className="max-w-xs px-4 py-2 rounded-lg bg-white text-devotional-text shadow border border-devotional-gold/20 italic text-sm flex items-center gap-2">
                  <span className="w-2 h-2 bg-devotional-gold rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-devotional-gold rounded-full animate-bounce delay-100"></span>
                  <span className="w-2 h-2 bg-devotional-gold rounded-full animate-bounce delay-200"></span>
                </div>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-devotional-maroon/20 bg-white rounded-b-lg">
            <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(userInput); }} className="flex items-center gap-2">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={t.narada.placeholder}
                className="flex-grow p-2 border border-devotional-maroon/30 rounded-lg focus:ring-2 focus:ring-devotional-gold focus:outline-none bg-gray-50 text-devotional-text placeholder-devotional-text/60"
                disabled={isLoading}
              />
              <button type="submit" className="bg-devotional-maroon text-white p-2 rounded-lg flex-shrink-0 hover:bg-devotional-maroon/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={isLoading || !userInput.trim()}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default NaradaChat;
