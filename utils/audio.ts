
export const stopNativeAudio = () => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};

// Helper to wait for voices to be loaded by the browser
const waitForVoices = (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    
    // Safety timeout of 3s in case onvoiceschanged never fires
    const timeoutId = setTimeout(() => {
        resolve(window.speechSynthesis.getVoices()); 
    }, 3000);

    window.speechSynthesis.onvoiceschanged = () => {
      clearTimeout(timeoutId);
      resolve(window.speechSynthesis.getVoices());
    };
  });
};

export const speak = async (text: string, language: string, onEnd: () => void) => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported');
    onEnd();
    return;
  }

  // Cancel any ongoing speech immediately
  window.speechSynthesis.cancel();
  // Also stop Web Audio if playing to prevent overlapping audio
  stopGlobalAudio();

  try {
    const voices = await waitForVoices();

    // Map app languages to BCP 47 tags
    const langCodeMap: Record<string, string> = {
      'en': 'en-IN',
      'te': 'te-IN',
      'hi': 'hi-IN',
      'ta': 'ta-IN',
      'kn': 'kn-IN'
    };

    const targetLang = langCodeMap[language] || 'en-US';

    // Smart Voice Selection
    let selectedVoice = voices.find(v => v.lang === targetLang);
    if (!selectedVoice) {
        const shortLang = targetLang.split('-')[0];
        selectedVoice = voices.find(v => v.lang.startsWith(shortLang));
    }
    // Fallback to Hindi for Indian languages if specific regional voice is missing
    if (!selectedVoice && ['te', 'ta', 'kn'].includes(language)) {
         selectedVoice = voices.find(v => v.lang === 'hi-IN');
    }
    // Fallback to any English voice
    if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.startsWith('en'));
    }

    // Split text into chunks to prevent Chrome timeout (max ~200 chars or 15 seconds)
    // Regex splits by sentence endings but keeps punctuation
    const chunks = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    
    let currentChunkIndex = 0;

    const speakNextChunk = () => {
        if (currentChunkIndex >= chunks.length) {
            onEnd();
            return;
        }

        const chunkText = chunks[currentChunkIndex].trim();
        if (!chunkText) {
            currentChunkIndex++;
            speakNextChunk();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(chunkText);
        utterance.lang = targetLang;
        // Slower rate for more "realistic" and clear enunciation
        utterance.rate = 0.85; 
        utterance.pitch = 1.0;
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        utterance.onend = () => {
            currentChunkIndex++;
            speakNextChunk();
        };

        utterance.onerror = (e) => {
            console.error('TTS Chunk Error:', e.error); // Log specific error string
            // Even if one chunk fails, try next or end? Usually better to end to avoid chaos.
            onEnd(); 
        };

        window.speechSynthesis.speak(utterance);
    };

    speakNextChunk();

  } catch (err) {
    console.error("Speak failed setup", err);
    onEnd();
  }
};

// Web Audio API implementation for Gemini TTS

let globalAudioContext: AudioContext | null = null;
let globalSource: AudioBufferSourceNode | null = null;

export const audioCache: Record<string, AudioBuffer> = {};

// --- IndexedDB for Persistent Caching ---
// Bumped version to v10 to invalidate old caches
const DB_NAME = 'GovindaMitraAudioDB_v10';
const DB_VERSION = 1;
const STORE_NAME = 'audio_store';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
        reject('IndexedDB not supported');
        return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveAudioToDB = async (key: string, base64: string) => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(base64, key);
  } catch (e) {
    console.warn('Failed to save audio to DB', e);
  }
};

export const getAudioFromDB = async (key: string): Promise<string | null> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result as string || null);
      request.onerror = () => resolve(null);
    });
  } catch (e) {
    console.warn('Failed to read audio from DB', e);
    return null;
  }
};

// ----------------------------------------

export function getGlobalAudioContext(): AudioContext {
  if (!globalAudioContext) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    globalAudioContext = new AudioContextClass();
  }
  return globalAudioContext!;
}

// Critical for mobile: Unlock audio context on user interaction
export function unlockAudioContext() {
  const ctx = getGlobalAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(e => console.error("Failed to resume audio context", e));
  }
  // Play silent buffer to unlock iOS/Safari
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch (e) {
    // Ignore errors during unlock
  }
}

export function decode(base64: string): Uint8Array {
  try {
    // Ensure base64 string is clean
    const cleanBase64 = base64.replace(/[\s\n\r]/g, '');
    const binaryString = atob(cleanBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error("Failed to decode base64 string", e);
    throw e;
  }
}

export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  // Create a safe view of the data. 
  // We calculate the length strictly based on 16-bit alignment.
  const length = Math.floor(data.byteLength / 2);
  
  // Using data.buffer directly can be dangerous if 'data' is a subarray or odd-length.
  // We pass byteOffset and explicit length to be safe.
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, length);
  
  const frameCount = length / numChannels;
  // We specify the sampleRate here (e.g., 24000) so the browser knows the speed of the source audio.
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert PCM 16-bit int to float [-1.0, 1.0]
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function playGlobalAudio(buffer: AudioBuffer, onEnded?: () => void) {
  stopGlobalAudio(); // Stop any existing audio
  const ctx = getGlobalAudioContext();
  
  // Resume context if suspended (browsers often suspend audio contexts created before user interaction)
  if (ctx.state === 'suspended') {
      ctx.resume().catch(e => console.error("Failed to resume audio context", e));
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = () => {
    if (onEnded) onEnded();
  };
  source.start(0);
  globalSource = source;
}

export function stopGlobalAudio() {
  if (globalSource) {
    // CRITICAL: Remove onended listener before stopping to prevent 
    // unintended callbacks (like setting state to stopped when switching tracks)
    globalSource.onended = null;
    try {
      globalSource.stop();
    } catch (e) {
      // Ignore errors if already stopped
    }
    globalSource.disconnect();
    globalSource = null;
  }
  // Also ensure native synthesis is stopped if this is called generically
  stopNativeAudio();
}

export function pauseGlobalAudio() {
  if (globalAudioContext && globalAudioContext.state === 'running') {
    globalAudioContext.suspend();
  }
}

export function resumeGlobalAudio() {
  if (globalAudioContext && globalAudioContext.state === 'suspended') {
    globalAudioContext.resume();
  }
}