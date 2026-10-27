import { NextResponse } from 'next/server';
import { getErrorMessage, isValidAudioUrl } from '@/utils/errorMessage';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function isNgrokConfigured(url: string | undefined): boolean {
  if (!url || url.trim() === '') return false
  const lower = url.toLowerCase()
  if (lower.includes('placeholder')) return false
  return lower.startsWith('http')
}

export async function POST(req: Request) {
  try {
    const { audioUrl, characterId } = await req.json();

    if (!audioUrl) {
      return NextResponse.json({ error: 'Audio URL is required' }, { status: 400 });
    }

    if (!isValidAudioUrl(audioUrl)) {
      return NextResponse.json({
        videoUrl: null,
        message: 'Invalid or empty audio — video animation skipped.',
      });
    }

    // Check disk cache first for instant replay
    const char = characterId || 'osho';
    const cacheKey = crypto.createHash('md5').update(`${char}_${audioUrl}`).digest('hex');
    const cacheDir = path.join(process.cwd(), 'public', 'videos', 'cache');
    const cacheFilePath = path.join(cacheDir, `${cacheKey}.mp4`);
    const publicUrl = `/videos/cache/${cacheKey}.mp4`;

    if (fs.existsSync(cacheFilePath)) {
      console.log(`[Animate] Serving pre-cached lip-sync video for ${char}: ${publicUrl}`);
      return NextResponse.json({ videoUrl: publicUrl });
    }

    console.log(`[Animate] Requesting animation for ${characterId || 'unknown'}:`, audioUrl.slice(0, 80) + '...');
    
    const ngrokUrl = process.env.NGROK_URL;

    if (!isNgrokConfigured(ngrokUrl)) {
      console.warn('[Animate] NGROK_URL not configured (or placeholder). Skipping video.');
      return NextResponse.json({ 
        videoUrl: null, 
        message: 'No Wav2Lip server configured. Video animation skipped.' 
      });
    }

    // Call the external Ngrok Wav2Lip server
    const startTime = Date.now();
    const animateRes = await fetch(`${ngrokUrl}/animate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        character_id: characterId || 'osho',
      }),
      signal: AbortSignal.timeout(180000), // 180s timeout buffer for Colab generation
    });

    const elapsedMs = Date.now() - startTime;
    console.log(`[Animate] Wav2Lip server responded in ${(elapsedMs / 1000).toFixed(1)}s with status ${animateRes.status}`);

    if (!animateRes.ok) {
      const errText = await animateRes.text().catch(() => '');
      console.warn(`[Animate] Wav2Lip server error (${animateRes.status}):`, errText);
      return NextResponse.json({
        videoUrl: null,
        message: `Wav2Lip server error (${animateRes.status}): ${errText.slice(0, 100)}. Playing audio only.`,
      });
    }

    const data = await animateRes.json();
    const videoUrl = data.video_url || data.videoUrl;

    if (!videoUrl) {
      return NextResponse.json({
        videoUrl: null,
        message: 'Video URL not found in Wav2Lip response.',
      });
    }

    let finalVideoUrl = videoUrl;
    if (videoUrl.startsWith('data:video/mp4;base64,')) {
      try {
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        const b64 = videoUrl.replace('data:video/mp4;base64,', '');
        fs.writeFileSync(cacheFilePath, Buffer.from(b64, 'base64'));
        finalVideoUrl = publicUrl;
        console.log(`[Animate] Cached video to ${cacheFilePath}`);
      } catch (cacheErr) {
        console.warn('[Animate] Failed to cache file on disk, passing data URL directly:', cacheErr);
      }
    }

    console.log('[Animate] Animation successful, video URL:', finalVideoUrl.slice(0, 80));
    return NextResponse.json({ videoUrl: finalVideoUrl });

  } catch (error: unknown) {
    console.error('[Animate] API Error:', error);
    return NextResponse.json({
      videoUrl: null,
      message: getErrorMessage(error) || 'Animation Failed',
    });
  }
}
