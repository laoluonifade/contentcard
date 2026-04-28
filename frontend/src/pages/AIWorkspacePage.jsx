import { useMemo } from 'react'
import { Sparkles, Wand2 } from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import useAppStore from '../stores/appStore'
import AssistantPage from './AssistantPage'
import AIPage from './AIPage'

const MODES = {
  create: {
    label: 'Create',
    icon: Sparkles,
    description: 'Chat, briefs, and generation',
  },
  refine: {
    label: 'Refine',
    icon: Wand2,
    description: 'Remix captions, variants, and visual polish',
  },
}

export default function AIWorkspacePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { brands, activeBrandId } = useAppStore()
  const activeBrand = useMemo(
    () => brands.find((brand) => brand.id === activeBrandId) || null,
    [brands, activeBrandId],
  )

  const legacyPathMode = location.pathname.endsWith('/ai') ? 'refine' : 'create'
  const queryMode = searchParams.get('mode')
  const mode = queryMode === 'refine' || queryMode === 'create' ? queryMode : legacyPathMode

  const switchMode = (nextMode) => {
    const next = new URLSearchParams(searchParams)
    if (nextMode === 'create') next.delete('mode')
    else next.set('mode', nextMode)
    setSearchParams(next, { replace: location.pathname.endsWith('/ai') })
    if (location.pathname.endsWith('/ai')) {
      navigate({ pathname: '/dashboard/assistant', search: next.toString() ? `?${next.toString()}` : '' }, { replace: true })
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-mist">
      <div className="border-b border-fog bg-surface px-5 py-5 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-500 flex items-center justify-center shadow-sm">
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-ink" style={{ letterSpacing: '-0.02em' }}>AI</h1>
              <p className="text-sm text-ink/45">
                {activeBrand ? `${activeBrand.name} · brief, generate, and refine in one place` : 'Brief, generate, and refine in one place'}
              </p>
            </div>
          </div>

          <div className="mt-4 inline-flex rounded-2xl border border-fog bg-mist p-1">
            {Object.entries(MODES).map(([key, config]) => {
              const Icon = config.icon
              const active = mode === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => switchMode(key)}
                  className={`min-w-[180px] rounded-xl px-4 py-3 text-left transition-all ${
                    active ? 'bg-surface shadow-sm text-ink' : 'text-ink/45 hover:text-ink'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Icon size={14} />
                    {config.label}
                  </div>
                  <p className="mt-1 text-xs text-ink/45">{config.description}</p>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {mode === 'refine' ? <AIPage embedded /> : <AssistantPage embedded />}
      </div>
    </div>
  )
}
