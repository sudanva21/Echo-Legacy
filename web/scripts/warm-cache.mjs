const questions = [
  { char: 'bhagat_singh', q: 'What is freedom?' },
  { char: 'osho', q: 'What is meditation?' },
  { char: 'tesla', q: 'What is electricity?' },
  { char: 'ssr', q: 'What is consciousness?' },
  { char: 'hitler', q: 'What was your vision?' }
];

async function run() {
  for (const item of questions) {
    console.log(`\n========================================`);
    console.log(`[Cache Warmer] Processing ${item.char} -> "${item.q}"`);
    
    // 1. Get chat response
    const chatRes = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: item.q, characterId: item.char })
    });
    const chatData = await chatRes.json();
    console.log(`[Chat Response]: ${chatData.text?.slice(0, 70)}...`);

    // 2. Synthesize authentic cloned speech via Smallest.ai
    const ttsRes = await fetch('http://localhost:3000/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: chatData.text, characterId: item.char })
    });
    const ttsData = await ttsRes.json();
    console.log(`[TTS Audio]: ${ttsData.audioUrl ? ttsData.audioUrl.length : 0} bytes`);

    // 3. Render and cache Wav2Lip video
    if (ttsData.audioUrl) {
      const animStart = Date.now();
      const animRes = await fetch('http://localhost:3000/api/animate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: ttsData.audioUrl, characterId: item.char })
      });
      const animData = await animRes.json();
      const elapsed = ((Date.now() - animStart) / 1000).toFixed(1);
      console.log(`[Video Result]: ${elapsed}s -> ${animData.videoUrl}`);
    }
  }
  console.log('\nAll 5 demo personas pre-warmed successfully!');
}

run().catch(console.error);
