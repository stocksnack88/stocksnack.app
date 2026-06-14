import { cache } from 'react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabase'

function makeClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
}

// Memoized per request — all server components share one getUser() HTTP call
export const getCachedUser = cache(async () => {
  const { data: { user } } = await makeClient().auth.getUser()
  return user
})

// Memoized per request per userId — all server components share one DB query
export const getCachedUserProfile = cache(async (userId: string) => {
  const { data } = await supabaseAdmin
    .from('user_profiles')
    .select('subscription_status, trial_used, trial_started_at, trial_extension_started_at, phone_number')
    .eq('id', userId)
    .single()
  return data ?? null
})
