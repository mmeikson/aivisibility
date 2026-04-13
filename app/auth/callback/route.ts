import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/db/client'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const saveId = searchParams.get('save')

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Associate pending report with this user
      if (saveId) {
        const db = createServiceClient()
        await db
          .from('reports')
          .update({ user_id: data.user.id })
          .eq('id', saveId)
          .is('user_id', null) // only claim unclaimed reports
      }

      const redirectTo = saveId ? `/report/${saveId}?saved=1` : next
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth?error=1`)
}
