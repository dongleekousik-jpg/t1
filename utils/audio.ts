// utils/audio.ts

export const stopNativeAudio = () => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};

// Helper to wait for voices to be loaded (Async)
const waitForVoices = (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    let voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    
    // Voices not loaded yet, wait for event
    window.speechSynthesis.onvoiceschanged = () => {
      voices = window.speechSynthesis.getVoices();
      resolve(voices);
    };
    
    // Timeout fallback after 2 seconds to avoid hanging
    setTimeout(() => {
        resolve(window.speechSynthesis.getVoices());
    }, 2000);
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

  // Wait for voices to load properly
  const voices = await waitForVoices();

  const utterance = new SpeechSynthesisUtterance(text);

  // Improved Voice Selection Logic
  const langMap: Record<string, string> = {
    'en': 'en-IN',
    'te': 'te-IN',
    'hi': 'hi-IN',
    'ta': 'ta-IN',
    'kn': 'kn-IN'
  };

  const targetLang = langMap[language] || 'en-US';
  
  // 1. Exact match (e.g., te-IN)
  let selectedVoice = voices.find(v => v.lang === targetLang);
  
  // 2. Loose match (e.g., any 'te' voice)
  if (!selectedVoice) {
      const shortLang = language; // 'te', 'hi', etc.
      selectedVoice = voices.find(v => v.lang.startsWith(shortLang));
  }
  
  // 3. Fallback to English India
  if (!selectedVoice) {
      selectedVoice = voices.find(v => v.lang === 'en-IN');
  }

  if (selectedVoice) {
    utterance.voice = selectedVoice;
    console.log(`Using voice: ${selectedVoice.name} (${selectedVoice.lang})`);
  } else {
    console.warn(`No voice found for ${targetLang}, using default.`);
  }

  // Rate correction
  utterance.rate = 0.9;
  
  utterance.onend = () => {
    onEnd();
  };

  utterance.onerror = (e) => {
    console.error('TTS Error:', e);
    onEnd();
  };

  window.speechSynthesis.speak(utterance);
};

// Web Audio API implementation for Gemini TTS

let globalAudioContext: AudioContext | null = null;
let globalSource: AudioBufferSourceNode | null = null;

export const audioCache: Record<string, AudioBuffer> = {};

// --- IndexedDB for Persistent Caching ---
// Bumped version to v11 to invalidate old caches
const DB_NAME = 'GovindaMitraAudioDB_v11';
const DB_VERSION = 11;
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
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    globalAudioContext = new AudioContextClass();
  }
  return globalAudioContext as AudioContext;
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
  // Guard against very small/invalid buffers
  if (!data || data.byteLength < 2) {
    throw new Error('Invalid audio data');
  }

  const length = Math.floor(data.byteLength / 2);
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, length);

  const frameCount = Math.floor(length / numChannels);
  if (frameCount <= 0) {
    throw new Error('Invalid frame count derived from audio data');
  }

  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = (dataInt16[i * numChannels + channel] || 0) / 32768.0;
    }
  }
  return buffer;
}

export function playGlobalAudio(buffer: AudioBuffer, onEnded?: () => void) {
  stopGlobalAudio(); // Stop any existing audio
  const ctx = getGlobalAudioContext();

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
    try {
      globalSource.onended = null;
    } catch (_) {}
    try {
      globalSource.stop();
    } catch (e) {
      // Ignore errors if already stopped
    }
    try {
      globalSource.disconnect();
    } catch (_) {}
    globalSource = null;
  }
  stopNativeAudio();
}

export function pauseGlobalAudio() {
  if (globalAudioContext && globalAudioContext.state === 'running') {
    globalAudioContext.suspend().catch(() => {});
  }
}

export function resumeGlobalAudio() {
  if (globalAudioContext && globalAudioContext.state === 'suspended') {
    globalAudioContext.resume().catch(() => {});
  }
}