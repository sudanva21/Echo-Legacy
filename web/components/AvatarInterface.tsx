'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Mic, MicOff, Send, LogOut, Loader2, Download, Volume2, Sparkles } from 'lucide-react'
import { characters, CharacterId } from '@/utils/characters'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { isValidAudioUrl } from '@/utils/errorMessage'
import FeedbackModal from '@/components/FeedbackModal'
import LipSyncAvatar from '@/components/LipSyncAvatar'

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'animating'

// Quick questions for each character
const getQuickQuestions = (characterId: CharacterId): string[] => {
  const questionMap: Record<string, string[]> = {
    osho: ['What is meditation?', 'How to find inner peace?', 'What is love?', 'Who are you?'],
    bhagat_singh: ['What is freedom?', 'Why did you fight?', 'What is patriotism?', 'Who are you?'],
    ssr: ['What is consciousness?', 'Tell me about stars', 'What is quantum physics?', 'Who are you?'],
    tesla: ['What is electricity?', 'How does energy work?', 'What is the future?', 'Who are you?'],
    hitler: ['What was your vision?', 'Why did you start the war?', 'What is leadership?', 'Who are you?']
  };
  return questionMap[characterId] || ['Who are you?', 'What is your philosophy?', 'What is life?'];
};

export default function AvatarInterface({ user, characterId }: { user: any, characterId: CharacterId }) {
  const [query, setQuery] = useState('')
  const [transcript, setTranscript] = useState<{ role: 'user' | 'avatar', content: string, audioUrl?: string }[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [isListening, setIsListening] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [isVideoRendering, setIsVideoRendering] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
  
  const character = characters[characterId] || characters.osho;

  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const recognitionRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    setIsClient(true)
  }, [])

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } catch {}
    router.refresh()
    router.push('/')
  }

  const handleFeedbackSubmit = async (rating: number, comment: string) => {
    try {
      await supabase.from('feedback').insert({
        user_id: user?.id || 'demo-user',
        user_email: user?.email || 'guest@ecolegacy.ai',
        character_id: characterId,
        rating,
        comment
      })
    } catch (err) {
      console.error('Failed to submit feedback:', err)
    }
  }

  // Text-to-Speech browser synthesis tailored to each historical persona
  const speakWithBrowserSynthesis = (text: string, charId: CharacterId) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)

      // Character-tailored vocal speed and pitch
      if (charId === 'osho') {
        utterance.rate = 0.88 // Slow, hypnotic, reflective
        utterance.pitch = 0.85
      } else if (charId === 'bhagat_singh') {
        utterance.rate = 1.05 // Passionate, bold
        utterance.pitch = 0.95
      } else if (charId === 'tesla') {
        utterance.rate = 1.0 // Crisp, focused
        utterance.pitch = 1.1
      } else if (charId === 'ssr') {
        utterance.rate = 1.02 // Energetic, thoughtful
        utterance.pitch = 1.02
      } else if (charId === 'hitler') {
        utterance.rate = 0.95
        utterance.pitch = 0.9
      }

      utterance.onend = () => {
        setPhase('idle')
      }
      utterance.onerror = () => {
        setPhase('idle')
      }

      window.speechSynthesis.speak(utterance)
    }
  }

  const handleSubmit = async (e: React.FormEvent | string) => {
    let userQuery = ''
    if (typeof e === 'string') {
      userQuery = e
    } else {
      e.preventDefault()
      userQuery = query
    }

    if (!userQuery.trim() || (phase !== 'idle' && phase !== 'listening')) return

    // Stop listening if mic was active
    if (isListening) {
      stopVoiceInput()
    }

    setQuery('')
    setTranscript(prev => [...prev, { role: 'user', content: userQuery }])
    setPhase('thinking')
    setAudioUrl(null)
    setVideoUrl(null)
    setIsVideoRendering(false)

    try {
      // 1. Get Character Response (LLM) - Fast & Grounded
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userQuery,
          characterId,
          userEmail: user?.email || 'guest@ecolegacy.ai'
        })
      })

      const chatData = await chatRes.json()
      if (!chatRes.ok) {
        throw new Error(chatData.error || 'Failed to generate discourse')
      }

      const responseText = chatData.text || 'I am here with you.'

      // Render character response to transcript
      setTranscript(prev => [...prev, {
        role: 'avatar',
        content: responseText
      }])

      // 2. Fetch authentic cloned voice from Smallest.ai via /api/tts
      try {
        const ttsRes = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: responseText,
            characterId,
            userEmail: user?.email || 'guest@ecolegacy.ai'
          }),
          signal: AbortSignal.timeout(22000)
        })

        const ttsData = await ttsRes.json()
        const generatedAudioUrl = ttsData?.audioUrl as string | undefined

        if (generatedAudioUrl && isValidAudioUrl(generatedAudioUrl)) {
          setPhase('animating')
          setIsVideoRendering(true)

          try {
            // Query Wav2Lip animation server (Colab / Ngrok)
            const animRes = await fetch('/api/animate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioUrl: generatedAudioUrl,
                characterId: characterId,
              }),
            })

            const animData = await animRes.json()
            if (animData?.videoUrl) {
              console.log('[AVATAR] Received synchronized Wav2Lip video')
              setVideoUrl(animData.videoUrl)
              setPhase('speaking')
              setIsVideoRendering(false)
              return
            }
          } catch (animErr) {
            console.warn('[AVATAR] Video animation fetch failed, playing audio directly:', animErr)
          }

          // Fallback to audio-only if video server is unavailable
          setIsVideoRendering(false)
          setAudioUrl(generatedAudioUrl)
          setPhase('speaking')
        } else {
          // Fallback to browser speech synthesis only if audio clone failed
          setPhase('speaking')
          speakWithBrowserSynthesis(responseText, characterId)
        }

      } catch (ttsErr) {
        console.warn('[AVATAR] TTS fetch failed, falling back to browser speech:', ttsErr)
        setPhase('speaking')
        speakWithBrowserSynthesis(responseText, characterId)
      }

    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : String(err)
      setTranscript(prev => [...prev, { role: 'avatar', content: `[${character.name}]: I hear your search. Let us reflect together.` }])
      setPhase('idle')
    }
  }

  // Voice Input (Web Speech API + MediaRecorder Groq Whisper Fallback)
  const startVoiceInput = async () => {
    if (phase !== 'idle') return

    setIsListening(true)
    setPhase('listening')

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition()
        recognition.continuous = false
        recognition.interimResults = true
        recognition.lang = 'en-US'

        recognition.onresult = (event: any) => {
          const transcriptText = Array.from(event.results)
            .map((res: any) => res[0].transcript)
            .join('')
          setQuery(transcriptText)
        }

        recognition.onerror = (event: any) => {
          console.warn('[VOICE] Speech recognition error:', event.error)
          stopVoiceInput()
        }

        recognition.onend = () => {
          setIsListening(false)
          setPhase('idle')
        }

        recognitionRef.current = recognition
        recognition.start()
        return
      } catch (e) {
        console.warn('[VOICE] Native SpeechRecognition start failed, trying MediaRecorder:', e)
      }
    }

    // Fallback: Record microphone audio and send to /api/stt (Groq Whisper)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const recorder = new MediaRecorder(stream)

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        
        if (audioBlob.size > 1000) {
          const formData = new FormData()
          formData.append('file', audioBlob, 'recording.webm')

          try {
            const res = await fetch('/api/stt', { method: 'POST', body: formData })
            const data = await res.json()
            if (data.text) {
              setQuery(data.text)
              handleSubmit(data.text)
            }
          } catch (sttErr) {
            console.error('[STT] Remote transcription error:', sttErr)
          }
        }
        setIsListening(false)
        setPhase('idle')
      }

      mediaRecorderRef.current = recorder
      recorder.start()
    } catch (micErr) {
      console.error('[VOICE] Microphone permission denied or unavailable:', micErr)
      setIsListening(false)
      setPhase('idle')
    }
  }

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
      recognitionRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch {}
      mediaRecorderRef.current = null
    }

    setIsListening(false)
    if (phase === 'listening') setPhase('idle')
  }

  const toggleVoiceInput = () => {
    if (isListening) {
      stopVoiceInput()
    } else {
      startVoiceInput()
    }
  }

  // Auto-play audio when available
  useEffect(() => {
    if (audioUrl && isValidAudioUrl(audioUrl) && !videoUrl && audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(e => {
        console.error("Audio autoplay failed:", e)
        setPhase('idle')
      })
    }
  }, [audioUrl, videoUrl])

  useEffect(() => {
    if (videoUrl && audioRef.current) {
      audioRef.current.pause()
    }
  }, [videoUrl])

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col h-screen p-4 sm:p-6 gap-4 font-sans">
      {/* Header */}
      <header className="flex justify-between items-center py-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-zinc-400 hover:text-white text-sm flex items-center gap-1.5 transition-colors">
            &larr; <span className="hidden sm:inline">All Personas</span>
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">{character.name}</h1>
          </div>
        </div>
        <button onClick={handleLogout} className="text-zinc-400 hover:text-white flex items-center gap-2 text-sm transition-colors">
          <LogOut size={16} /> <span className="hidden sm:inline">Sign out</span>
        </button>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0">
        
        {/* Avatar Visuals */}
        <div className="w-full md:w-1/2 flex flex-col items-center justify-center bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm">
          <LipSyncAvatar
            image={character.image}
            name={character.name}
            characterId={characterId}
            isSpeaking={phase === 'speaking'}
            audioElement={audioRef.current}
            videoUrl={videoUrl}
            isVideoRendering={isVideoRendering}
            onVideoEnded={() => setPhase('idle')}
            onVideoError={() => setVideoUrl(null)}
          />

          {/* Status Overlay for Listening / Thinking */}
          {(phase === 'listening' || phase === 'thinking') && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-black/85 backdrop-blur-md border border-white/10 text-white px-5 py-2.5 rounded-full text-sm flex items-center gap-2.5 shadow-xl whitespace-nowrap z-30">
              {phase === 'listening' && (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                  <span className="text-red-400 font-medium">Listening to your voice...</span>
                </>
              )}
              {phase === 'thinking' && (
                <>
                  <Loader2 size={16} className="animate-spin text-indigo-400" />
                  <span>Reflecting...</span>
                </>
              )}
            </div>
          )}

          {/* Hidden audio element for speech playback */}
          {audioUrl && !videoUrl && (
            <audio 
              ref={audioRef} 
              src={audioUrl} 
              className="hidden" 
              onEnded={() => setPhase('idle')}
              onError={() => setPhase('idle')}
            />
          )}

          {/* Audio Download Button */}
          {audioUrl && (
            <div className="absolute top-4 right-4 z-10">
              <a 
                href={audioUrl} 
                download={`${character.id}_response.wav`} 
                className="p-2.5 bg-black/60 hover:bg-black/90 backdrop-blur-md rounded-full text-white flex items-center justify-center transition-all shadow-lg border border-white/10"
                title="Download Audio"
              >
                <Download size={18} />
              </a>
            </div>
          )}
        </div>

        {/* Chat / Discourse Interface */}
        <div className="w-full md:w-1/2 flex flex-col bg-zinc-900/60 border border-zinc-800/80 rounded-2xl overflow-hidden backdrop-blur-sm">
          {/* Transcript */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4">
            {transcript.length === 0 && (
              <div className="m-auto text-center text-zinc-400 w-full flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                  <Mic className="w-6 h-6 text-indigo-400" />
                </div>
                <h3 className="text-white font-medium text-base mb-1">Start Voice or Text Discourse</h3>
                <p className="text-xs text-zinc-400 max-w-xs mb-6">
                  Speak into your microphone or ask any question on your own to hear {character.name}&apos;s authentic voice and perspective.
                </p>
                {isClient && (
                  <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                    {getQuickQuestions(characterId).map(q => (
                      <button 
                        key={q}
                        onClick={() => handleSubmit(q)}
                        disabled={phase !== 'idle' && phase !== 'listening'}
                        className="px-3.5 py-1.5 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs rounded-full transition-all border border-zinc-700/60 hover:border-indigo-500/50 hover:text-white"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {transcript.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-zinc-400 font-medium px-1">
                    {msg.role === 'user' ? 'You' : character.name}
                  </span>
                  {msg.role === 'avatar' && msg.audioUrl && (
                    <a 
                      href={msg.audioUrl} 
                      download={`${character.id}_response_${i}.wav`}
                      className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
                      title="Download audio"
                    >
                      <Download size={12} />
                    </a>
                  )}
                </div>
                <div className={`px-4 py-3 rounded-2xl max-w-[88%] text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-tr-sm shadow-md' 
                    : 'bg-zinc-800 text-zinc-100 rounded-tl-sm border border-zinc-700/60 shadow-md'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
          </div>

          {/* Voice Input & Query Area */}
          <div className="p-4 bg-zinc-950/80 border-t border-zinc-800/80">
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <button 
                type="button"
                onClick={toggleVoiceInput}
                disabled={phase !== 'idle' && phase !== 'listening'}
                className={`p-3 rounded-full transition-all flex items-center justify-center ${
                  isListening 
                    ? 'bg-red-600 text-white ring-4 ring-red-500/30 animate-pulse' 
                    : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
                title={isListening ? "Click to stop listening" : "Click to speak via voice"}
              >
                {isListening ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              
              <input 
                type="text" 
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={isListening ? "Listening... speak now" : "Ask anything in your own words..."}
                className="flex-1 bg-zinc-800/90 border border-zinc-700/50 rounded-full px-5 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                disabled={phase !== 'idle' && phase !== 'listening'}
              />
              
              <button 
                type="submit"
                disabled={!query.trim() || (phase !== 'idle' && phase !== 'listening')}
                className="p-3 rounded-full bg-white text-zinc-900 hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                title="Send message"
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>
      </div>

      <FeedbackModal 
        isOpen={isFeedbackOpen} 
        onClose={() => setIsFeedbackOpen(false)} 
        onSubmit={handleFeedbackSubmit} 
      />
    </div>
  )
}
