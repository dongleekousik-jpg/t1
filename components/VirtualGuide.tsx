

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { useLanguage } from '../App';
import { 
    decode, 
    decodeAudioData, 
    audioCache, 
    playGlobalAudio, 
    stopGlobalAudio, 
    pauseGlobalAudio, 
    resumeGlobalAudio, 
    getGlobalAudioContext,
    speak 
} from '../utils/audio';
import { Icon } from '../constants/icons';

interface VirtualGuideProps {
  placeId: string;
  placeContent: { name: string; description: string; importance: string };
  onClose: () => void;
}

const VirtualGuide: React.FC<VirtualGuideProps> = ({ placeId, placeContent, onClose }) => {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'playing' | 'paused' | 'stopped'>('stopped');
  const isMounted = useRef(false);

  const cacheKey = `${language}-${placeId}`;

  useEffect(() => {
    isMounted.current = true;
    handlePlay(true);

    return () => {
        isMounted.current = false;
        stopGlobalAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, language]);

  const fetchAndPlayAudio = async () => {
    try {
        setLoading(true);
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

        const textToSpeak = `${placeContent.name}. ${placeContent.importance}`.trim();

        let response;
        try {
            response = await ai.models.generateContent({
              model: "gemini-2.5-flash-preview-tts",
              contents: [{ parts: [{ text: textToSpeak }] }],
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                },
              },
            });
        } catch (err) {
            console.warn("Primary TTS failed in Virtual Guide", err);
        }

        let base64Audio = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        
        // FALLBACK 1
        if (!base64Audio) {
            console.log("Retrying with simplified text in Virtual Guide...");
            const simpleText = `${placeContent.name}. Please visit this holy place.`.trim();
             try {
                const retryResponse = await ai.models.generateContent({
                  model: "gemini-2.5-flash-preview-tts",
                  contents: [{ parts: [{ text: simpleText }] }],
                  config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                    },
                  },
                });
                base64Audio = retryResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            } catch (retryErr) {
                 console.error("Retry failed in Virtual Guide", retryErr);
            }
        }

        if (base64Audio && isMounted.current) {
            const ctx = getGlobalAudioContext();
            const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
            
            // Save to cache
            audioCache[cacheKey] = audioBuffer;
            
            // Play only if still mounted
            if (isMounted.current) {
                playGlobalAudio(audioBuffer, () => {
                    if (isMounted.current) setStatus('stopped');
                });
                setStatus('playing');
            }
        } else {
            throw new Error("No audio generated");
        }
    } catch (error) {
        console.warn("Gemini TTS failed, switching to native TTS", error);
        
        // FALLBACK 2: Native TTS
        if (isMounted.current) {
            const textToSpeak = `${placeContent.name}. ${placeContent.importance}`.trim();
            speak(textToSpeak, language, () => {
                 if(isMounted.current) setStatus('stopped');
            });
            setStatus('playing');
        } else {
            setStatus('stopped');
        }

    } finally {
        if (isMounted.current) setLoading(false);
    }
  };

  const handlePlay = (autoPlay = false) => {
    if (status === 'paused') {
        resumeGlobalAudio();
        setStatus('playing');
        return;
    }

    if (audioCache[cacheKey]) {
        playGlobalAudio(audioCache[cacheKey], () => {
             if(isMounted.current) setStatus('stopped');
        });
        setStatus('playing');
    } else {
        if (autoPlay || status === 'stopped') {
            fetchAndPlayAudio();
        }
    }
  };

  const handlePause = () => {
      pauseGlobalAudio();
      setStatus('paused');
  };

  const handleStop = () => {
      stopGlobalAudio();
      setStatus('stopped');
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-devotional-cream rounded-xl shadow-2xl w-full max-w-lg p-6 relative border-2 border-devotional-gold flex flex-col max-h-[85vh]">
        <button onClick={onClose} className="absolute top-3 right-3 text-devotional-maroon hover:text-red-600 transition-colors z-10">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
           </svg>
        </button>

        <div className="text-center mb-4 flex-shrink-0">
             <h3 className="text-2xl md:text-3xl font-serif-display text-devotional-maroon mb-2">{placeContent.name}</h3>
             <div className="h-1 w-24 bg-devotional-gold mx-auto rounded"></div>
        </div>

        <div className="flex-grow overflow-y-auto space-y-6 px-2 pb-4 scrollbar-thin scrollbar-thumb-devotional-maroon scrollbar-track-devotional-cream/50">
            <p className="text-devotional-text/80 border-l-4 border-devotional-maroon pl-4">
                {placeContent.description}
            </p>

            <div className="bg-white/60 p-5 rounded-lg shadow-inner border border-devotional-gold/30">
                 <h4 className="font-bold text-devotional-maroon mb-3 flex items-center gap-2 text-lg">
                    <Icon name="narada" className="w-8 h-8" />
                    Narada's Insight
                 </h4>
                 <p className="text-lg leading-relaxed font-serif-display text-devotional-text">
                     {placeContent.importance}
                 </p>
            </div>
        </div>

        <div className="flex-shrink-0 pt-4 border-t border-devotional-gold/30 flex flex-col items-center justify-center gap-4">
             {loading ? (
                 <div className="flex items-center gap-3 text-devotional-maroon">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-devotional-maroon"></div>
                      <span className="font-semibold animate-pulse">Narada is preparing audio...</span>
                 </div>
             ) : (
                 <div className="flex items-center gap-6">
                    {status === 'playing' ? (
                        <button 
                            onClick={handlePause}
                            className="flex flex-col items-center gap-1 text-devotional-maroon hover:text-devotional-gold transition-colors"
                            title="Pause"
                        >
                            <div className="bg-devotional-maroon text-devotional-cream p-3 rounded-full shadow-lg hover:bg-devotional-text">
                                <Icon name="pause" className="w-8 h-8" />
                            </div>
                            <span className="text-sm font-bold">Pause</span>
                        </button>
                    ) : (
                        <button 
                            onClick={() => handlePlay(false)}
                            className="flex flex-col items-center gap-1 text-devotional-maroon hover:text-devotional-gold transition-colors"
                            title={status === 'paused' ? "Resume" : "Play"}
                        >
                            <div className="bg-devotional-maroon text-devotional-cream p-3 rounded-full shadow-lg hover:bg-devotional-text">
                                <Icon name="play" className="w-8 h-8 pl-1" />
                            </div>
                            <span className="text-sm font-bold">{status === 'paused' ? "Resume" : "Play"}</span>
                        </button>
                    )}

                    <button 
                        onClick={handleStop}
                        className={`flex flex-col items-center gap-1 transition-colors ${status === 'stopped' ? 'opacity-50 cursor-not-allowed text-gray-500' : 'text-red-700 hover:text-red-500'}`}
                        disabled={status === 'stopped'}
                        title="Stop"
                    >
                         <div className={`p-3 rounded-full border-2 ${status === 'stopped' ? 'border-gray-400' : 'border-red-700'}`}>
                            <Icon name="stop" className="w-6 h-6" />
                         </div>
                         <span className="text-sm font-bold">Stop</span>
                    </button>
                 </div>
             )}
             {status === 'playing' && (
                 <div className="flex items-center gap-2 text-devotional-maroon/70 animate-pulse text-sm">
                     <Icon name="audio" className="w-4 h-4"/>
                     <span>Narada is explaining...</span>
                 </div>
             )}
        </div>
      </div>
    </div>
  );
};

export default VirtualGuide;