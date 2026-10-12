import { NextResponse } from 'next/server';
import { characters, CharacterId } from '@/utils/characters';
import { getReferenceAudioPath } from '@/utils/referenceAudioPath';
import { extractGradioAudioPath } from '@/utils/gradioAudio';
import { getErrorMessage, isValidAudioUrl } from '@/utils/errorMessage';
import fs from 'fs';

const HF_SPACE = 'chenxie95/Cross-Lingual_F5-TTS_Space';

function getHfTokens(): string[] {
  return [
    process.env.HUGGINGFACE_TOKEN,
    process.env.HUGGINGFACE_TOKEN_1,
    process.env.HUGGINGFACE_TOKEN_2,
    process.env.HUGGINGFACE_TOKEN_3,
    process.env.HUGGINGFACE_TOKEN_4,
    process.env.HUGGINGFACE_TOKEN_5,
  ].filter(Boolean) as string[];
}

/** Voice clone using character reference clip via Hugging Face F5-TTS */
async function generateWithHuggingFace(
  text: string,
  characterId: CharacterId,
  referenceAudioPath: string,
): Promise<{ audioUrl: string; source: string }> {
  const hfTokens = getHfTokens();
  if (hfTokens.length === 0) {
    throw new Error('No HUGGINGFACE_TOKEN configured');
  }

  const { Client, handle_file } = await import('@gradio/client');
  let lastError: unknown = null;

  for (let i = 0; i < hfTokens.length; i++) {
    const token = hfTokens[i];
    try {
      console.log(`[TTS] Trying HF F5-TTS Space (token ${i + 1}/${hfTokens.length})...`);
      const gradioClient = await Client.connect(HF_SPACE, { hf_token: token } as any);
      const character = characters[characterId];

      const result = await gradioClient.predict('/basic_tts', {
        ref_wav_input: handle_file(referenceAudioPath),
        ref_text_input: character.referenceText || '',
        gen_txt_input: text,
        randomize_seed: true,
        seed_input: 0,
      });

      const audioPath = extractGradioAudioPath(result);
      if (audioPath) {
        console.log(`[TTS] HF F5-TTS successfully produced audio:`, audioPath);
        return { audioUrl: audioPath, source: 'huggingface-f5' };
      }
    } catch (err: unknown) {
      lastError = err;
      console.warn(`[TTS] HF token ${i + 1} failed:`, getErrorMessage(err));
    }
  }

  throw new Error(`HF F5-TTS failed: ${getErrorMessage(lastError)}`);
}

/** Generate audio via local Python TTS server (Edge-TTS) */
async function generateWithLocalServer(
  text: string,
  characterId: CharacterId,
): Promise<{ audioUrl: string; source: string }> {
  const localTtsUrl = process.env.LOCAL_TTS_URL || 'http://localhost:5000';
  const localTimeoutMs = Number(process.env.LOCAL_TTS_TIMEOUT_MS || 25000);

  console.log(`[TTS] Calling local TTS server at ${localTtsUrl}/tts for ${characterId}...`);

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
  if (arrayBuffer.byteLength < 100) {
    throw new Error('Local TTS returned insufficient audio data');
  }

  const base64Audio = Buffer.from(arrayBuffer).toString('base64');
  const audioUrl = `data:audio/wav;base64,${base64Audio}`;

  console.log(`[TTS] Local TTS successfully generated audio (${arrayBuffer.byteLength} bytes)`);
  return { audioUrl, source: 'local-neural-tts' };
}

export async function POST(req: Request) {
  try {
    const { text, characterId, userEmail } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const id = ((characterId as CharacterId) in characters ? characterId : 'osho') as CharacterId;
    const character = characters[id];

    console.log(`[TTS] Synthesizing speech for ${character.name}: "${text.substring(0, 50)}..."`);

    // 1. Primary: Ultra-fast local neural TTS server (Edge-TTS models)
    try {
      const localResult = await generateWithLocalServer(text, id);
      return NextResponse.json({
        audioUrl: localResult.audioUrl,
        cached: false,
        source: localResult.source,
        character: character.name,
      });
    } catch (localErr: any) {
      console.warn('[TTS] Local TTS server not available or failed:', localErr.message);
    }

    // 2. Secondary: HuggingFace F5-TTS reference voice cloning
    try {
      const referenceAudioPath = getReferenceAudioPath(id);
      if (fs.existsSync(referenceAudioPath)) {
        const hfResult = await generateWithHuggingFace(text, id, referenceAudioPath);
        return NextResponse.json({
          audioUrl: hfResult.audioUrl,
          cached: false,
          source: hfResult.source,
          character: character.name,
        });
      }
    } catch (hfErr: any) {
      console.warn('[TTS] HuggingFace F5-TTS failed:', hfErr.message);
    }

    // 3. Fallback: If both fail, return structured signal for client-side Web Speech API
    console.log('[TTS] Falling back to client-side speech synthesis');
    return NextResponse.json({
      audioUrl: null,
      fallbackToSpeechSynthesis: true,
      text,
      character: character.name,
      source: 'web-speech-fallback',
    });

  } catch (error: any) {
    console.error('[TTS] Fatal error:', error);
    return NextResponse.json(
      { error: error.message || 'TTS generation failed' },
      { status: 500 },
    );
  }
}
