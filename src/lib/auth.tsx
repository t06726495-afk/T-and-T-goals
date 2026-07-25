import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './types'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  coupleId: string | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [coupleId, setCoupleId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data ?? null)
    return data as Profile | null
  }, [])

  useEffect(() => {
    if (profile?.accent_color) {
      document.documentElement.style.setProperty('--color-mine', profile.accent_color)
    }
  }, [profile?.accent_color])

  const refreshProfile = useCallback(async () => {
    if (session?.user.id) {
      await fetchProfile(session.user.id)
    }
  }, [session, fetchProfile])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) {
        const p = await fetchProfile(data.session.user.id)
        // Best-effort: capture the browser timezone on first login instead
        // of leaving everyone on the 'UTC' default.
        if (p && p.timezone === 'UTC' && active) {
          const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
          if (detected && detected !== 'UTC') {
            await supabase.from('profiles').update({ timezone: detected }).eq('id', p.id)
            if (active) setProfile({ ...p, timezone: detected })
          }
        }
        // Every signed-in user needs a couple_id to create goals, even
        // before they've paired — get_or_create_my_couple hands back their
        // own solo couple until a partner joins it.
        const { data: coupleData } = await supabase.rpc('get_or_create_my_couple')
        if (active && coupleData) {
          setCoupleId((coupleData as { couple_id: string }).couple_id)
        }
      }
      if (active) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        fetchProfile(newSession.user.id)
      } else {
        setProfile(null)
        setCoupleId(null)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider
      value={{ session, profile, coupleId, loading, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
