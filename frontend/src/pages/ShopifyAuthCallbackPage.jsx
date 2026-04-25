import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from '../components/ui/Toast'
import useAuthStore from '../stores/authStore'
import { authApi } from '../api'

export default function ShopifyAuthCallbackPage() {
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const { setSession } = useAuthStore()

  useEffect(() => {
    const run = async () => {
      const token = search.get('token')
      const nextPath = search.get('next') || '/shopify/decision'
      const missing = search.get('missing') || ''
      if (!token) {
        toast.error('Shopify login failed. Please try again.')
        navigate('/login', { replace: true })
        return
      }
      try {
        const stored = localStorage.getItem('contentcard-auth')
        const prevUser = stored ? JSON.parse(stored)?.state?.user : null
        setSession({ token, user: prevUser || null })
        const user = await authApi.me()
        setSession({ token, user })
        if (missing) {
          navigate(`/shopify/complete-onboarding?missing=${encodeURIComponent(missing)}`, { replace: true })
          return
        }
        navigate(nextPath, { replace: true })
      } catch {
        toast.error('Could not complete Shopify sign-in.')
        navigate('/login', { replace: true })
      }
    }
    run()
  }, [navigate, search, setSession])

  return (
    <div className="min-h-screen grid place-items-center bg-mist">
      <div className="text-sm text-ink/70">Connecting your Shopify account…</div>
    </div>
  )
}
