import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NoteBlock } from './notes'

export type RemoteNoteRow = {
  id: string
  user_id: string | null
  title: string
  icon: string
  summary: string | null
  blocks: NoteBlock[] | unknown
  favorited: boolean | null
  folder: string | null
  tags: string[] | unknown
  is_public: boolean | null
  updated_at: string
}

let browserClient: SupabaseClient | null = null

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  )
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null
  }

  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    )
  }

  return browserClient
}
