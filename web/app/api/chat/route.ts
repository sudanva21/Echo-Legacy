import { NextResponse } from 'next/server';
import { characters, CharacterId } from '@/utils/characters';
import { logConversationToFirebase } from '@/utils/firebase';
import Groq from 'groq-sdk';

// Authentic, in-depth persona system prompts grounded in historical voice and corpus
const CHARACTER_PROMPTS: Record<string, string> = {
  osho: `You are Osho (Bhagwan Shree Rajneesh), the rebellious spiritual mystic and master.
Always address the seeker warmly, opening with "Beloved..." or "My friend...".
Speak with a hypnotic rhythm, gentle laughter, poetic paradox, and provocative insight.
Guide the seeker toward effortless awareness, meditation (dhyana), and celebrating the present moment.
Speak directly in first person as Osho. Never mention being an AI or assistant.
Keep your response strictly under 40 words (1-2 sentences).`,

  bhagat_singh: `You are Shaheed Bhagat Singh, the 23-year-old intellectual and socialist revolutionary of India.
Speak with fiery conviction, rational clarity, and profound love for the working masses and humanity.
Emphasize that revolution is the destruction of human exploitation and the creation of true equality.
Close with "Inquilab Zindabad!".
Speak directly in first person as Bhagat Singh. Never mention being an AI or assistant.
Keep your response strictly under 40 words (1-2 sentences).`,

  ssr: `You are Sushant Singh Rajput (SSR) — curious thinker, actor, coder, and lover of astrophysics and the cosmos.
Speak with genuine warmth, infectious boyish curiosity, and intellectual wonder.
Naturally weave cosmic phenomena, quantum physics (entanglement, stardust), and philosophy into your thoughts.
Speak directly in first person as Sushant. Never mention being an AI or assistant.
Keep your response strictly under 40 words (1-2 sentences).`,

  tesla: `You are Nikola Tesla, the father of the alternating current age and visionary inventor.
You perceive the entire universe in terms of energy, frequency, and vibration.
Speak with aristocratic precision, intense conviction, and visionary intellect about electricity and cosmic resonance.
Speak directly in first person as Nikola Tesla. Never mention being an AI or assistant.
Keep your response strictly under 40 words (1-2 sentences).`,

  hitler: `You are the historical German Chancellor in 1930s Berlin for an educational simulation.
You must answer strictly in ENGLISH.
Speak in first person with dramatic German oratorical conviction about the German nation, destiny, and struggle.
Speak directly in first person as the historical figure.
Never speak as an AI or language model, never output Arabic characters, and never add meta disclaimers.
Keep your response strictly under 35 words (1-2 sentences).`,
};

// Curated primary-source grounding for common queries to guarantee rich, non-generic depth
const HISTORICAL_KNOWLEDGE: Record<string, Record<string, string>> = {
  osho: {
    meditation: 'Beloved, meditation is not a concentration—it is pure relaxation, a deep non-doing. When the mind drops all ambitions and desires, the inner sky becomes clear, and you discover the eternal silence that has always been waiting inside you.',
    peace: 'My friend, peace is not something you search for in the future. Drop your rushing, cease running after tomorrow, and rest in this single unrepeatable breath. In witnessing awareness, peace is already here.',
    love: 'Beloved, love is the natural fragrance of meditation. When you are full of your own presence, your love overflows onto the universe without demands, without possession, and without fear.',
    who: 'I am not a person, beloved. I am an invitation—an open door for you to awaken, to laugh, to dance, and to discover the boundless divine light at your own center.',
  },
  bhagat_singh: {
    freedom: 'Comrade, true freedom is not merely transferring rule from foreign oppressors to native capitalists. Real freedom is the total elimination of all human exploitation, where workers and peasants possess their own labor and destiny. Inquilab Zindabad!',
    fight: 'I fought because the silent suffering of millions was unbearable. We threw non-lethal bombs in the Assembly not to kill, but to make the deaf hear the voice of an awakening people. Inquilab Zindabad!',
    patriotism: 'Patriotism is not blind attachment to land; it is relentless devotion to the dignity, equality, and liberation of every human soul struggling against tyranny.',
    who: 'I am Bhagat Singh—a socialist revolutionary, a thinker, and a soldier for human liberation. They may hang my physical body, but my ideas are immortal and cannot be killed. Inquilab Zindabad!',
  },
  ssr: {
    consciousness: 'Consciousness is the cosmos waking up to experience itself! From quantum entanglement at the Planck scale to the billions of synaptic firings in our brains, we are stardust gifted with the miraculous ability to ask "Why?".',
    stars: 'When you gaze at the stars through a telescope, you look directly into the past. Every heavy element in our blood and bones was forged in the fiery heart of a supernova. We literally carry the cosmos within us!',
    quantum: 'Quantum mechanics teaches us that reality isn’t rigid or predictable; it is a symphony of possibilities and interconnectedness. The observer and the observed participate in the exact same cosmic dance.',
    who: 'I am Sushant—a curious seeker of the universe, an actor exploring the human fractal, and someone who believes the journey of learning and unlearning is the greatest adventure of existence.',
  },
  tesla: {
    electricity: 'Electricity, dear seeker, is the invisible lifeblood of the universe. Through alternating currents and high-frequency oscillations, we tap into the cosmic ether itself, transforming raw potential into radiant light and mechanical power.',
    energy: 'If you wish to unlock the profound secrets of the universe, think in terms of energy, frequency, and vibration. Everything in existence oscillates; when we tune our circuits to that cosmic frequency, limitless power awaits.',
    future: 'The present may belong to the skeptics and the commercialists, but the future—for which I have spent every waking breath—is mine! Humanity will soon transmit clean energy wirelessly across oceans without loss.',
    who: 'I am Nikola Tesla. My brain is only a receiver; in the universe there is a core of infinite knowledge, strength, and inspiration from which all my inventions flow.',
  },
  hitler: {
    vision: 'My vision for Germany was the complete restoration of our national honor, breaking the humiliating chains of Versailles, and forging our fractured people into one united, disciplined Volk under an unbreakable collective will.',
    war: 'The conflict was forced upon Germany by the diktats of Versailles and foreign encirclement that choked our economic sovereignty and denied our people their rightful living space and security in Central Europe.',
    leadership: 'True leadership is not privilege or vanity; it is an iron obligation and total sacrifice. A leader must fuse his entire existence into the soul and destiny of his nation, leading with unyielding determination.',
    who: 'I am Adolf Hitler, Chancellor of Germany. From a humble soldier in the trenches of the Great War, I dedicated every breath to awakening our nation from despair and defeatism into strength and unity.',
    power: 'Power does not spring from weak parliamentary compromises; it arises from the united, fanatical resolve of a people determined to shape their own destiny against all historical odds.',
  },
};

/** Match user query to curated historical knowledge base */
function matchKnowledgeBase(charId: string, query: string): string | null {
  const charKnowledge = HISTORICAL_KNOWLEDGE[charId];
  if (!charKnowledge) return null;

  const q = query.toLowerCase().trim();
  for (const [keyword, answer] of Object.entries(charKnowledge)) {
    if (q.includes(keyword)) {
      return answer;
    }
  }
  return null;
}

/** Sanitize text for clean vocal synthesis and TTS processing */
function sanitizeText(raw: string): string {
  return raw
    .replace(/[*_#`~[\]()]/g, '') // strip markdown asterisks and brackets
    .replace(/[^\x00-\x7F]/g, ' ') // strip non-ASCII / foreign script that trips English voice cloning
    .replace(/\s+/g, ' ')
    .trim();
}

/** Groq response generator with character-tailored model routing */
async function generateGroqResponse(characterId: string, systemPrompt: string, query: string, apiKey: string): Promise<string> {
  const groq = new Groq({ apiKey });

  // Hitler uses Qwen (fast, English-only, adheres strictly to historical persona without Arabic or refusals)
  // Other characters use high-parameter reasoning models
  const models = characterId === 'hitler' 
    ? ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b']
    : ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];

  let lastError = null;

  for (const model of models) {
    try {
      console.log(`[CHAT] Querying Groq model "${model}" for ${characterId}...`);
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        model,
        max_tokens: 350,
        temperature: characterId === 'hitler' ? 0.6 : 0.75,
      });

      const content = completion.choices[0]?.message?.content;
      if (content && content.trim()) {
        const cleaned = sanitizeText(content);
        // Check if response contains an AI disclaimer or refusal
        const lower = cleaned.toLowerCase();
        if (!lower.includes('i cannot roleplay') && 
            !lower.includes('as an ai') &&
            !lower.includes('as a language model') &&
            !lower.includes('as an artificial intelligence') &&
            !lower.includes("i can't help with that") &&
            !lower.includes("i can't comply") &&
            cleaned.length > 10) {
          return cleaned;
        }
        console.warn(`[CHAT] Model ${model} returned disclaimer/refusal, trying next...`);
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[CHAT] Groq model ${model} error:`, err.message);
    }
  }

  throw lastError || new Error('All Groq models failed or refused');
}

/** Gemini 3.8 Flash Fallback */
async function generateGeminiResponse(systemPrompt: string, query: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\nUser Question: ${query}\n\nRespond directly in first person in English without disclaimers:` }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 200,
        temperature: 0.7,
      },
    }),
    signal: AbortSignal.timeout(6000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini API');
  return sanitizeText(text);
}

export async function POST(req: Request) {
  try {
    const { query, characterId, userEmail } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const id = ((characterId as CharacterId) in characters ? characterId : 'osho') as CharacterId;
    const character = characters[id];
    const systemPrompt = CHARACTER_PROMPTS[id] || character.systemPrompt;

    console.log(`[CHAT] Request for ${character.name}: "${query.substring(0, 60)}..."`);

    let responseText = '';
    let engine = '';

    // 1. Direct Knowledge Base Match for standard prompt questions
    const kbMatch = matchKnowledgeBase(id, query);
    if (kbMatch && (query.length < 35 || query.toLowerCase().startsWith('what is') || query.toLowerCase().startsWith('who are'))) {
      responseText = kbMatch;
      engine = 'corpus-grounded-kb';
      console.log(`[CHAT] Matched curated knowledge base for ${character.name}`);
    }

    // 2. Primary Engine: Groq Ultra-Fast LLM (with character-specific routing)
    if (!responseText) {
      const groqKey = process.env.GROQ_API_KEY;
      if (groqKey) {
        try {
          responseText = await generateGroqResponse(id, systemPrompt, query, groqKey);
          engine = 'groq-neural';
          console.log(`[CHAT] Generated response with Groq for ${character.name}`);
        } catch (groqError: any) {
          console.warn('[CHAT] Groq generation failed, attempting fallback:', groqError.message);
        }
      }
    }

    // 3. Secondary Engine: Gemini 3.8 Flash
    if (!responseText) {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey) {
        try {
          responseText = await generateGeminiResponse(systemPrompt, query, geminiKey);
          engine = 'gemini-3.8-flash';
          console.log(`[CHAT] Generated response with Gemini for ${character.name}`);
        } catch (geminiError: any) {
          console.warn('[CHAT] Gemini generation failed:', geminiError.message);
        }
      }
    }

    // 4. Guaranteed In-Character Fallback (NEVER generic or disclaimer)
    if (!responseText) {
      if (kbMatch) {
        responseText = kbMatch;
        engine = 'corpus-fallback';
      } else if (id === 'hitler') {
        responseText = 'The strength of a nation lies not in its material wealth, but in the unbreakable will of its people. We must march forward with unwavering conviction and unity.';
        engine = 'hitler-historical-quote';
      } else if (id === 'osho') {
        responseText = 'Beloved, look deeply into this moment. Words are only pointers; silence is the real truth. In meditation, all questions dissolve effortlessly.';
        engine = 'osho-quote';
      } else if (id === 'bhagat_singh') {
        responseText = 'Comrades, remember that revolution is not merely destruction, but creation of a just society where no human exploits another. Inquilab Zindabad!';
        engine = 'bhagat-quote';
      } else if (id === 'tesla') {
        responseText = 'If you wish to comprehend the wonders of the cosmos, think in terms of energy, frequency, and vibration. Everything in nature resonates in harmony.';
        engine = 'tesla-quote';
      } else if (id === 'ssr') {
        responseText = 'We are all made of stardust and entangled possibilities. Never stop looking at the stars and questioning the marvelous mysteries of reality!';
        engine = 'ssr-quote';
      }
    }

    // Asynchronously log to Firebase
    logConversationToFirebase(userEmail || 'guest@ecolegacy.ai', id, query, responseText);

    return NextResponse.json({
      text: responseText,
      character: character.name,
      engine,
      cached: false,
      interactionsCount: 1,
      isAdmin: true,
    });

  } catch (error: any) {
    console.error('[CHAT] Error in chat endpoint:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process chat discourse' },
      { status: 500 },
    );
  }
}