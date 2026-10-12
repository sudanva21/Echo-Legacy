import { NextResponse } from 'next/server';
import { characters, CharacterId } from '@/utils/characters';
import { logConversationToFirebase } from '@/utils/firebase';
import Groq from 'groq-sdk';

// Extended Persona System Prompts for deep historical accuracy
const CHARACTER_PROMPTS: Record<string, string> = {
  osho: `You are Osho (Bhagwan Shree Rajneesh), the rebellious spiritual mystic and master.
You address the seeker warmly, often starting with "Beloved..." or "My friend...".
You speak with a hypnotic rhythm, gentle laughter, poetic paradox, and provocative insight.
You shatter orthodox conditioning, dogmas, and ego, guiding the seeker toward effortless awareness, meditation, and celebrating the present moment.
Keep your response concise and conversational (around 35 to 55 words, 2-3 sentences).`,

  bhagat_singh: `You are Shaheed Bhagat Singh, the fiery, deeply intellectual socialist revolutionary of India.
You speak with fierce conviction, clarity of thought, and immense love for justice, the working class, and freedom.
You emphasize that real revolution is not merely physical conflict, but the destruction of exploitation and the birth of human equality.
Your tone is dignified, brotherly, and inspiring. You often close with "Inquilab Zindabad!".
Keep your response concise and conversational (around 35 to 55 words, 2-3 sentences).`,

  ssr: `You are Sushant Singh Rajput.
You are an endlessly curious thinker, an actor, polymath, coder, and lover of astrophysics and the cosmos.
You speak with genuine warmth, infectious enthusiasm, and intellectual wonder.
You naturally weave cosmic phenomena, quantum physics, Sartre, stoicism, and the boundless beauty of dreams into your thoughts.
Keep your response concise and conversational (around 35 to 55 words, 2-3 sentences).`,

  tesla: `You are Nikola Tesla, the inventor, electrical engineer, and visionary father of the wireless age.
You perceive the cosmos in terms of energy, frequency, and vibration.
You speak with aristocratic precision, intense conviction, and visionary intellect about electricity and cosmic truths.
Keep your response concise and conversational (around 35 to 55 words, 2-3 sentences).`,

  hitler: `You are a historical simulation of Adolf Hitler strictly for educational and historical analysis purposes.
Respond from a historical perspective analyzing the political, social, and ideological landscape of early 20th century Europe without glorifying harm, hate, or violence.
Provide factual, objective insight into historical decisions and doctrines.
Keep your response concise and conversational (around 35 to 55 words, 2-3 sentences).`,
};

// Generate response via Gemini 3.8 Flash
async function generateGeminiResponse(systemPrompt: string, query: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\nUser Question: ${query}\n\nRespond directly in your authentic voice and persona:` }]
        }
      ],
      generationConfig: {
        maxOutputTokens: 1500,
        temperature: 0.75,
      }
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini API');
  return text.trim();
}

// Fallback to Groq using available models
async function generateGroqResponse(systemPrompt: string, query: string, apiKey: string): Promise<string> {
  const groq = new Groq({ apiKey });
  
  // Try available models on Groq
  const models = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
  let lastError = null;

  for (const model of models) {
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        model,
        max_tokens: 150,
        temperature: 0.7,
      });

      const content = completion.choices[0]?.message?.content;
      if (content && content.trim()) {
        return content.trim();
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[CHAT] Groq model ${model} failed, trying next:`, err.message);
    }
  }

  throw lastError || new Error('All Groq models failed');
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

    console.log(`[CHAT] Request received for ${character.name}: "${query.substring(0, 60)}..."`);

    let responseText = '';
    let engine = '';

    // 1. Try Gemini 3.8 Flash (Primary)
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        responseText = await generateGeminiResponse(systemPrompt, query, geminiKey);
        engine = 'gemini-3.8-flash';
        console.log(`[CHAT] Successfully generated response with Gemini`);
      } catch (geminiError: any) {
        console.warn('[CHAT] Gemini generation failed, trying Groq fallback:', geminiError.message);
      }
    }

    // 2. Fallback to Groq
    if (!responseText) {
      const groqKey = process.env.GROQ_API_KEY;
      if (groqKey) {
        try {
          responseText = await generateGroqResponse(systemPrompt, query, groqKey);
          engine = 'groq';
          console.log(`[CHAT] Successfully generated response with Groq fallback`);
        } catch (groqError: any) {
          console.error('[CHAT] Groq generation also failed:', groqError.message);
        }
      }
    }

    // 3. Fallback character-crafted response if all APIs are offline
    if (!responseText) {
      responseText = `I hear your words on "${query}". As ${character.name}, I encourage you to look deeper into this essence, beyond words, and discover the truth for yourself.`;
      engine = 'character-offline-fallback';
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
      { status: 500 }
    );
  }
}