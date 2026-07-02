import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/db/client'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // Prefer query params (email flow), fall back to cookies (Google OAuth flow)
  const saveId = searchParams.get('save') ?? request.cookies.get('oauth_save')?.value ?? null
  const next = searchParams.get('next') ?? (request.cookies.get('oauth_next') ? decodeURIComponent(request.cookies.get('oauth_next')!.value) : '/dashboard')

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
      const response = NextResponse.redirect(`${origin}${redirectTo}`)
      // Clear OAuth state cookies
      response.cookies.set('oauth_save', '', { path: '/', maxAge: 0 })
      response.cookies.set('oauth_next', '', { path: '/', maxAge: 0 })
      return response
    }
  }

  return NextResponse.redirect(`${origin}/auth?error=1`)
}
