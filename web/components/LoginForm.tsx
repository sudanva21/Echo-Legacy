'use client'

import { createClient } from '@/utils/supabase/client'
import { useState } from 'react'

export default function LoginForm() {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const getRedirectUrl = () => {
    // 1. If running in browser and deployed on Vercel/production, always use current live origin
    if (typeof window !== 'undefined' && window.location.origin) {
      if (!window.location.origin.includes('localhost') && !window.location.origin.includes('127.0.0.1')) {
        return `${window.location.origin}/auth/callback`
      }
    }
    // 2. Production site URL if configured in environment and not localhost
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    if (siteUrl && !siteUrl.includes('localhost') && !siteUrl.includes('127.0.0.1')) {
      return `${siteUrl.replace(/\/+$/, '')}/auth/callback`
    }
    // 3. Vercel deployment URL
    if (process.env.NEXT_PUBLIC_VERCEL_URL) {
      return `https://${process.env.NEXT_PUBLIC_VERCEL_URL.replace(/\/+$/, '')}/auth/callback`
    }
    // 4. Fallback in browser (for localhost development)
    if (typeof window !== 'undefined' && window.location.origin) {
      return `${window.location.origin}/auth/callback`
    }
    return 'https://echo-legacy20.vercel.app/auth/callback'
  }

  const handleLogin = async () => {
    setLoading(true)
    const callbackUrl = getRedirectUrl()
    console.log('[AUTH] Initiating Google sign-in with redirect:', callbackUrl)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
      },
    })
  }

  return (
    <button
      onClick={handleLogin}
      disabled={loading}
      className="bg-white text-zinc-900 px-6 py-3 rounded-full font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center gap-2"
    >
      {loading ? 'Connecting...' : 'Sign in with Google'}
    </button>
  )
}
