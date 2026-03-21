import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Root URL (http://localhost:3000/) — sends the user to the right place.
 */
export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('period_start_day')
    .eq('id', user.id)
    .single()

  if (!profile?.period_start_day) {
    redirect('/onboarding')
  }

  redirect('/hub')
}
