'use client'

import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/db/client'

export default function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    await getSupabaseClient().auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-xs font-mono text-[#ABABAB] hover:text-[#141414] transition-colors"
    >
      Sign out
    </button>
  )
}
