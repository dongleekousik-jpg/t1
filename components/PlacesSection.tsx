

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { useLanguage } from '../App';
import { Place } from '../types';
import { Icon } from '../constants/icons';
import { 
  decode, 
  decodeAudioData, 
  playGlobalAudio, 
  stopGlobalAudio, 
  getGlobalAudioContext, 
  audioCache,
  getAudioFromDB,
  saveAudioToDB,
  speak,
  unlockAudioContext
} from '../utils/audio';

interface PlacesSectionProps {
  title: string;
  places: Place[];
  isSpiritual?: boolean;
}

interface PlaceCardProps {
  place: Place;
  isSpiritual?: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  onToggleAudio: (place: Place) => void;
}

const PlaceCard: React.FC<PlaceCardProps> = ({ place, isSpiritual, isPlaying, isLoading, onToggleAudio }) => {
  const { t } = useLanguage();
  const placeContent = t.places[place.id as keyof typeof t.places];

  const handleViewOnMap = () => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.mapQuery)}`, '_blank');
  };

  // Get importance text safely
  const importance = 'importance' in placeContent ? (placeContent as any).importance : null;
  
  return (
    <div className={`bg-white/90 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden transition-all duration-300 flex flex-col ${isPlaying ? 'ring-4 ring-devotional-gold scale-[1.02]' : 'hover:scale-105 border border-devotional-gold/30'}`}>
      <div className="p-6 flex-grow">
        <div className="flex justify-between items-start mb-2">
             <div className="flex-grow pr-2">
                <h3 className="text-xl font-bold font-serif-display text-devotional-maroon leading-tight">{placeContent.name}</h3>
                <p className="text-xs text-devotional-gold font-bold uppercase tracking-wider mt-1">{placeContent.category}</p>
             </div>
        </div>
        
        <p className="text-devotional-text/90 mt-3 leading-relaxed">{placeContent.description}</p>
        
        {isSpiritual && importance && (
          <div className={`mt-4 p-3 bg-devotional-cream/40 rounded-lg border-l-4 border-devotional-gold/50 transition-all duration-500`}>
             <p className="text-sm italic text-devotional-maroon/90">
                <span className="font-bold not-italic mr-1 text-devotional-maroon">Narada's Insight:</span>
                "{importance}"
             </p>
          </div>
        )}
      </div>
      
      <div className="bg-gray-50/80 p-4 border-t border-gray-100 flex flex-col gap-3">
        {/* Audio Player for Spiritual Places */}
        {isSpiritual && (
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleAudio(place);
                }}
                disabled={isLoading}
                className={`w-full py-3 px-4 rounded-md flex items-center justify-center gap-3 font-bold shadow-sm transition-all duration-300 
                    ${isPlaying 
                        ? 'bg-devotional-maroon text-white hover:bg-red-800 animate-pulse' 
                        : 'bg-green-700 text-white hover:bg-green-800'}
                    ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}
                    `}
            >
                {isLoading ? (
                     <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                     <Icon name={isPlaying ? "stop" : "play"} className="w-6 h-6" />
                )}
                <span>
                    {isLoading 
                        ? 'Loading Audio...' 
                        : (isPlaying ? t.buttons.stopExplanation : t.buttons.listenToExplanation)}
                </span>
            </button>
        )}

        <button 
          onClick={handleViewOnMap}
          className="flex items-center justify-center gap-2 w-full bg-white border border-devotional-maroon/20 text-devotional-maroon px-4 py-2 rounded-md hover:bg-devotional-maroon hover:text-white transition-colors font-medium text-sm"
        >
          <Icon name="map" className="w-4 h-4"/>
          {t.buttons.viewOnMap}
        </button>
      </div>
    </div>
  );
};

const PlacesSection: React.FC<PlacesSectionProps> = ({ title, places, isSpiritual = false }) => {
  const { t, language } = useLanguage();
  const [playingPlaceId, setPlayingPlaceId] = useState<string | null>(null);
  const [loadingPlaceId, setLoadingPlaceId] = useState<string | null>(null);
  
  // Refs to track mounted state and active request to avoid race conditions
  const isMounted = useRef(true);
  const activeRequestId = useRef<string | null>(null);

  useEffect(() => {
      isMounted.current = true;
      return () => { isMounted.current = false; stopGlobalAudio(); };
  }, []);

  // Stop audio if language changes
  useEffect(() => {
      stopGlobalAudio();
      setPlayingPlaceId(null);
      setLoadingPlaceId(null);
  }, [language]);

  // Preload audio from Persistent Storage (IndexedDB) to Memory Cache (RAM)
  useEffect(() => {
    if (!isSpiritual) return;

    let isActive = true;

    const preloadAudio = async () => {
      const promises = places.map(async (place) => {
        const cacheKey = `${language}-${place.id}`;
        // If already in RAM, skip
        if (audioCache[cacheKey]) return;

        // Try load from DB
        try {
            const cachedBase64 = await getAudioFromDB(cacheKey);
            if (cachedBase64 && isActive) {
                const ctx = getGlobalAudioContext();
                // Decode asynchronously
                const audioBuffer = await decodeAudioData(decode(cachedBase64), ctx, 24000, 1);
                // Store in RAM
                audioCache[cacheKey] = audioBuffer;
            }
        } catch (e) {
            // Silently fail preloading, will try again on click
            console.debug("Preload failed for", place.id, e);
        }
      });
      
      await Promise.all(promises);
    };
    
    preloadAudio();

    return () => { isActive = false; };
  }, [language, places, isSpiritual]);

  const handleToggleAudio = async (place: Place) => {
      // CRITICAL: Unlock audio context immediately on user interaction for mobile support
      unlockAudioContext();
      
      // If clicking the same playing place, stop it.
      if (playingPlaceId === place.id) {
          stopGlobalAudio();
          setPlayingPlaceId(null);
          return;
      }

      // Stop any currently playing audio immediately
      stopGlobalAudio();
      setPlayingPlaceId(null);

      // Generate a unique ID for this specific request
      const requestId = `${Date.now()}-${place.id}`;
      activeRequestId.current = requestId;

      const cacheKey = `${language}-${place.id}`;

      // 1. Check In-Memory Cache (Fastest - RAM)
      if (audioCache[cacheKey]) {
           playGlobalAudio(audioCache[cacheKey], () => {
               if(isMounted.current) setPlayingPlaceId(null);
           });
           setPlayingPlaceId(place.id);
           return;
      }

      // Start Loading UI
      setLoadingPlaceId(place.id);
      
      try {
          // 2. Check Persistent Cache (IndexedDB - Disk)
          const cachedBase64DB = await getAudioFromDB(cacheKey);

          // If the user cancelled this request while we were reading DB, abort
          if (activeRequestId.current !== requestId) return;

          if (cachedBase64DB) {
              const ctx = getGlobalAudioContext();
              const audioBuffer = await decodeAudioData(decode(cachedBase64DB), ctx, 24000, 1);
              
              // Promote to Memory Cache
              audioCache[cacheKey] = audioBuffer;
              
              if (isMounted.current) {
                   playGlobalAudio(audioBuffer, () => {
                       if(isMounted.current) setPlayingPlaceId(null);
                   });
                   setPlayingPlaceId(place.id);
                   setLoadingPlaceId(null);
              }
              return;
          }

          // 3. Generate from API (Slowest - Network)
          const content = t.places[place.id as keyof typeof t.places];
          
          // Safe extraction of content
          const name = (content.name || "").trim();
          const description = (content.description || "").trim();
          const importance = 'importance' in content ? ((content as any).importance || "").trim() : "";
          
          // Ensure concise and clean text for TTS
          const textToSpeak = `${name}. ${description} ${importance}`.replace(/["']/g, "").trim();

          if (!textToSpeak) {
             throw new Error("No content to speak");
          }

          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
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
             console.warn("Primary TTS request failed, attempting fallback", err);
          }

          let base64Audio = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          
          // FALLBACK 1: If full text fails (e.g. safety filters), try just the name and simple text
          if (!base64Audio) {
              console.log("Retrying with simplified text...");
              const simpleText = `${name}. Please visit this sacred place.`.replace(/["']/g, "").trim();
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
                 console.error("Retry failed", retryErr);
              }
          }

          if (base64Audio) {
              // Save to DB immediately
              saveAudioToDB(cacheKey, base64Audio);
              
              // Only play if this is still the active request
              if (activeRequestId.current === requestId && isMounted.current) {
                   const ctx = getGlobalAudioContext();
                   const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                   
                   // Update Memory Cache
                   audioCache[cacheKey] = audioBuffer;
                   
                   // Play
                   playGlobalAudio(audioBuffer, () => {
                       if(isMounted.current) setPlayingPlaceId(null);
                   });
                   setPlayingPlaceId(place.id);
              }
          } else {
              throw new Error("No audio data received from API after retry");
          }
      } catch (error) {
          console.warn("Gemini TTS failed completely, falling back to native browser TTS", error);
          
          // FALLBACK 2: Native Browser TTS (Last Resort)
          if (activeRequestId.current === requestId && isMounted.current) {
              const content = t.places[place.id as keyof typeof t.places];
              const name = content.name;
              const description = content.description;
              const importance = 'importance' in content ? (content as any).importance : "";
              const textToSpeak = `${name}. ${description} ${importance}`;

              speak(textToSpeak, language, () => {
                  if(isMounted.current) setPlayingPlaceId(null);
              });
              setPlayingPlaceId(place.id);
          }

      } finally {
          // Only clear loading if this is still the active request
          if (isMounted.current && activeRequestId.current === requestId) {
              setLoadingPlaceId(null);
          }
      }
  };

  return (
    <div className="space-y-8 relative pb-12">
      <h2 className="text-3xl md:text-4xl font-serif-display text-center text-devotional-maroon border-b-2 border-devotional-gold pb-2">
        {title}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {places.map((place) => (
          <PlaceCard 
            key={place.id} 
            place={place} 
            isSpiritual={isSpiritual} 
            isPlaying={playingPlaceId === place.id}
            isLoading={loadingPlaceId === place.id}
            onToggleAudio={handleToggleAudio}
          />
        ))}
      </div>
    </div>
  );
};

export default PlacesSection;