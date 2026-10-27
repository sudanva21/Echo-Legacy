'use client'

import React, { useRef, useEffect } from 'react'
import { CharacterId } from '@/utils/characters'
import { Loader2, Film, Volume2 } from 'lucide-react'

interface LipSyncAvatarProps {
  image: string
  name: string
  characterId: CharacterId
  isSpeaking: boolean
  audioElement: HTMLAudioElement | null
  videoUrl: string | null
  isVideoRendering?: boolean
  onVideoEnded?: () => void
  onVideoError?: () => void
}

export default function LipSyncAvatar({
  image,
  name,
  characterId,
  isSpeaking,
  audioElement,
  videoUrl,
  isVideoRendering = false,
  onVideoEnded,
  onVideoError
}: LipSyncAvatarProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isMutedByBrowser, setIsMutedByBrowser] = React.useState(false)

  // Play video automatically when it becomes available
  useEffect(() => {
    if (videoUrl && videoRef.current) {
      setIsMutedByBrowser(false)
      videoRef.current.currentTime = 0
      videoRef.current.muted = false
      
      const playPromise = videoRef.current.play()
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          console.warn('Video unmuted auto-play blocked by browser policy:', e)
          // Fallback: Play muted first so lip-sync video is never lost, and show unmute toggle
          if (videoRef.current) {
            videoRef.current.muted = true
            videoRef.current.play().then(() => {
              setIsMutedByBrowser(true)
            }).catch((mutedErr) => {
              console.error('Video decode/playback error:', mutedErr)
              if (onVideoError) onVideoError()
            })
          }
        })
      }
    }
  }, [videoUrl, onVideoError])

  const handleUnmute = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (videoRef.current) {
      videoRef.current.muted = false
      setIsMutedByBrowser(false)
    }
  }

  return (
    <div 
      onClick={isMutedByBrowser ? handleUnmute : undefined}
      className={`relative w-full aspect-[4/5] max-w-sm rounded-2xl overflow-hidden bg-zinc-950 transition-all duration-500 shadow-2xl flex items-center justify-center group ${
        isMutedByBrowser ? 'cursor-pointer ring-2 ring-amber-500/50' : ''
      } ${
        isSpeaking
          ? 'border-2 border-emerald-500/80 shadow-[0_0_50px_rgba(16,185,129,0.35)] ring-4 ring-emerald-500/20'
          : 'border border-zinc-800'
      }`}>
      {/* 1. High-Resolution Original Historical Portrait (Always un-distorted & naturally proportioned) */}
      <img
        src={image}
        alt={name}
        className={`w-full h-full object-cover transition-all duration-700 ease-out select-none ${
          isSpeaking ? 'scale-[1.03]' : 'scale-100 group-hover:scale-105'
        } ${videoUrl ? 'opacity-0 absolute pointer-events-none' : 'opacity-100'}`}
        onError={(e) => {
          e.currentTarget.src = "https://raw.githubusercontent.com/sudanva21/Echo-Legacy/main/web/public/images/osho.jpeg"
        }}
      />

      {/* 2. Neural Wav2Lip Lip-Sync Video Player (Fades in seamlessly when video is ready) */}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-cover rounded-xl shadow-2xl absolute inset-0 z-10 animate-in fade-in duration-500"
          controls={false}
          autoPlay
          playsInline
          onEnded={onVideoEnded}
          onError={onVideoError}
        />
      )}

      {/* Subtle bottom vignette gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent pointer-events-none" />

      {/* Audio-reactive speech wave glow around mouth area */}
      {isSpeaking && !videoUrl && (
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-emerald-950/50 via-emerald-900/10 to-transparent pointer-events-none animate-pulse" />
      )}

      {/* Live Status Indicators */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20 pointer-events-none whitespace-nowrap">
        {videoUrl ? (
          isMutedByBrowser ? (
            <button
              onClick={handleUnmute}
              className="pointer-events-auto bg-amber-500 hover:bg-amber-400 text-black px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.6)] animate-bounce transition-all cursor-pointer"
            >
              <Volume2 size={14} className="text-black" />
              <span>Tap to Unmute Voice</span>
            </button>
          ) : (
            <div className="bg-black/90 backdrop-blur-md border border-cyan-500/40 text-cyan-300 px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 shadow-xl animate-in fade-in">
              <Film size={14} className="text-cyan-400 animate-pulse" />
              <span>AI Neural Lip-Sync Video</span>
            </div>
          )
        ) : isSpeaking ? (
          <div className="bg-black/90 backdrop-blur-md border border-emerald-500/40 text-emerald-300 px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2.5 shadow-xl">
            <div className="flex items-center gap-0.5 h-3">
              <span className="w-0.5 bg-emerald-400 rounded-full animate-pulse h-2" />
              <span className="w-0.5 bg-emerald-400 rounded-full animate-bounce h-3.5" />
              <span className="w-0.5 bg-emerald-400 rounded-full animate-pulse h-2" />
              <span className="w-0.5 bg-emerald-400 rounded-full animate-bounce h-3.5" />
              <span className="w-0.5 bg-emerald-400 rounded-full animate-pulse h-2" />
            </div>
            <span>Speaking...</span>
          </div>
        ) : isVideoRendering ? (
          <div className="bg-black/90 backdrop-blur-md border border-indigo-500/40 text-indigo-300 px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 shadow-xl">
            <Loader2 size={13} className="animate-spin text-indigo-400" />
            <span>Rendering Lip-Sync in Colab...</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
