import { NextResponse } from 'next/server';
import { characters, CharacterId } from '@/utils/characters';

// Official pre-trained Smallest.ai voice clones for all 5 characters
const CHARACTER_VOICE_IDS: Record<string, string> = {
  osho: 'voice_SlEiKoRgNX',
  bhagat_singh: 'voice_k1KX1wW56a',
  ssr: 'voice_OdTNncyyNP',
  tesla: 'voice_RrcezTCRAl',
  hitler: 'voice_TGaoN2HRlM',
};

/** High-fidelity voice synthesis using Smallest.ai Lightning v3.1 API */
async function generateWithSmallestAi(
  text: string,
  characterId: string,
  apiKey: string,
): Promise<{ audioUrl: string; source: string }> {
  const voiceId = CHARACTER_VOICE_IDS[characterId] || CHARACTER_VOICE_IDS.osho;
  const url = 'https://api.smallest.ai/waves/v1/lightning-v3.1/get_speech';

  // Sanitize and optimize text length for lightning-fast voice synthesis (2-3 seconds)
  let cleanText = text
    .replace(/[*_#`~[\]()]/g, '') // remove markdown
    .replace(/[^\x00-\x7F]/g, ' ') // remove non-ASCII
    .replace(/\s+/g, ' ')
    .trim();

  // If text is too long, take the first two complete sentences to prevent synthesis lag
  if (cleanText.length > 280) {
    const sentences = cleanText.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length >= 2) {
      cleanText = sentences.slice(0, 2).join(' ').trim();
    } else {
      cleanText = cleanText.substring(0, 280).trim();
    }
  }

  console.log(`[TTS] Synthesizing speech with Smallest.ai for "${characterId}" (voiceId: ${voiceId}, len: ${cleanText.length})...`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: cleanText,
      voice_id: voiceId,
      speed: 1.0,
      sample_rate: 24000,
      output_format: 'wav',
    }),
    signal: AbortSignal.timeout(20000), // 20s generous timeout so it never prematurely aborts
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Smallest.ai returned HTTP ${response.status}: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength < 500) {
    throw new Error('Smallest.ai returned invalid or empty audio');
  }

  const base64Audio = Buffer.from(arrayBuffer).toString('base64');
  const audioUrl = `data:audio/wav;base64,${base64Audio}`;

  console.log(`[TTS] Smallest.ai successfully synthesized ${arrayBuffer.byteLength} bytes of cloned audio for ${characterId}`);
  return { audioUrl, source: 'smallest-ai-cloned' };
}

/** Fallback: Local TTS server (Edge-TTS models) */
async function generateWithLocalServer(
  text: string,
  characterId: CharacterId,
): Promise<{ audioUrl: string; source: string }> {
  const localTtsUrl = process.env.LOCAL_TTS_URL || 'http://localhost:5000';
  const localTimeoutMs = Number(process.env.LOCAL_TTS_TIMEOUT_MS || 2500);

  console.log(`[TTS] Trying local TTS fallback at ${localTtsUrl}/tts for ${characterId}...`);

  const response = await fetch(`${localTtsUrl}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
    body: JSON.stringify({ text, character_id: characterId }),
    signal: AbortSignal.timeout(localTimeoutMs),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Local TTS server returned ${response.status}: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength < 500) {
    throw new Error('Local TTS returned insufficient audio data');
  }

  const base64Audio = Buffer.from(arrayBuffer).toString('base64');
  const audioUrl = `data:audio/wav;base64,${base64Audio}`;

  return { audioUrl, source: 'local-neural-tts' };
}

export async function POST(req: Request) {
  try {
    const { text, characterId } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const id = ((characterId as CharacterId) in characters ? characterId : 'osho') as CharacterId;
    const character = characters[id];

    console.log(`[TTS] Speech request for ${character.name}: "${text.substring(0, 50)}..."`);

    // 1. Primary Engine: Smallest.ai authentic character voice clone
    const smallestKey = process.env.SMALLEST_API_KEY || 'sk_807304f995e368e0e86ff84dd9f48691';
    if (smallestKey) {
      try {
        const result = await generateWithSmallestAi(text, id, smallestKey);
        return NextResponse.json({
          audioUrl: result.audioUrl,
          cached: false,
          source: result.source,
          character: character.name,
        });
      } catch (smallestErr: any) {
        console.warn('[TTS] Smallest.ai failed, falling back to secondary:', smallestErr.message);
      }
    }

    // 2. Secondary Engine: Local neural TTS
    try {
      const localResult = await generateWithLocalServer(text, id);
      return NextResponse.json({
        audioUrl: localResult.audioUrl,
        cached: false,
        source: localResult.source,
        character: character.name,
      });
    } catch (localErr: any) {
      console.warn('[TTS] Local TTS server failed:', localErr.message);
    }

    // 3. Fallback: Browser Web Speech API
    console.log('[TTS] Falling back to browser speech synthesis');
    return NextResponse.json({
      audioUrl: null,
      fallbackToSpeechSynthesis: true,
      text,
      character: character.name,
      source: 'web-speech-fallback',
    });

  } catch (error: any) {
    console.error('[TTS] Fatal error in TTS route:', error);
    return NextResponse.json(
      { error: error.message || 'TTS generation failed' },
      { status: 500 },
    );
  }
}
