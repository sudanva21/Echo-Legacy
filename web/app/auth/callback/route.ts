import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/'
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')

  // Dynamically resolve the true origin (respecting Vercel / reverse proxy headers)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : requestUrl.origin

  // Handle auth errors (like flow_state_already_used)
  if (error) {
    console.log(`[AUTH] Auth error: ${error} - ${errorDescription}`)
    return NextResponse.redirect(`${origin}${next}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!exchangeError) {
      const redirectUrl = `${origin}${next}`
      console.log(`[AUTH] Auth successful, redirecting to: ${redirectUrl}`)
      return NextResponse.redirect(redirectUrl)
    } else {
      console.error(`[AUTH] Code exchange failed:`, exchangeError)
    }
  }

  // Fallback to home page on any auth code issue
  return NextResponse.redirect(`${origin}${next}`)
}
