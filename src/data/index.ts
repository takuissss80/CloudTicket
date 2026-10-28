import { localRepo } from './localRepo'
import { crearSupabaseRepo } from './supabaseRepo'
import type { Repo } from './repo'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Con credenciales de Supabase usa la base real; sin ellas, modo demo local. */
export const repo: Repo = url && key ? crearSupabaseRepo(url, key) : localRepo
