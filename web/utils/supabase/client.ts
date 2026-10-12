import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: 'guest_user_1',
              email: 'guest@ecolegacy.ai',
              user_metadata: { name: 'Guest Explorer' },
            },
          },
          error: null,
        }),
        signOut: async () => {},
        signInWithOAuth: async () => {},
      },
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
        insert: async () => ({ data: null, error: null }),
      }),
    } as any
  }

  return createBrowserClient(url, anonKey)
}
