import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Globe, Sparkles, ArrowRight, RotateCcw } from 'lucide-react'
import useAppStore from '../stores/appStore'
import useAuthStore from '../stores/authStore'
import { contentApi, uploadApi } from '../api'
import { buildCampaignBrief } from '../utils/campaignBrief'
import AuthEntryModal from '../components/auth/AuthEntryModal'

// ─── Constants ───────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook',  label: 'Facebook'  },
  { id: 'twitter',   label: 'Twitter/X' },
  { id: 'linkedin',  label: 'LinkedIn'  },
]

const SUGGESTIONS = [
  'Generate my Instagram posts for this month',
  "What's trending in my niche?",
  'Create a product launch campaign',
  'Plan content around upcoming holidays',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildBrief(messages) {
  const raw = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')
  return raw.slice(0, 12000)
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TypingIndicator({ browsing }) {
  return (
    <div className="flex items-start gap-3 max-w-[85%]">
      {/* Avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center mt-0.5">
        <Sparkles size={13} className="text-white" />
      </div>

      <div className="flex flex-col gap-1.5">
        {/* Browsing pill */}
        {browsing && (
          <div className="flex items-center gap-1.5 text-xs text-ink/50 bg-mist border border-fog rounded-full px-3 py-1 w-fit animate-pulse">
            <Globe size={11} />
            <span>Browsing the web…</span>
          </div>
        )}

        {/* Dots */}
        <div className="bg-mist border border-fog rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  )
}

function AssistantBubble({ message, onNavigate }) {
  const isProgress = message.type === 'progress'
  const isDone = message.type === 'done'
  const isError = message.type === 'error'

  return (
    <div className="flex items-start gap-3 max-w-[85%]">
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${
          isError ? 'bg-red-100' : 'bg-brand-500'
        }`}
      >
        <Sparkles size={13} className={isError ? 'text-red-500' : 'text-white'} />
      </div>

      <div
        className={`rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed ${
          isError
            ? 'bg-red-50 border border-red-200 text-red-700'
            : isProgress
            ? 'bg-brand-50 border border-brand-200 text-brand-800'
            : 'bg-mist border border-fog text-ink'
        }`}
      >
        {isProgress && (
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
            <span className="text-xs font-medium text-brand-600 uppercase tracking-wide">Generating…</span>
          </div>
        )}

        <p className="whitespace-pre-wrap">{message.content}</p>

        {isDone && onNavigate && (
          <button
            onClick={onNavigate}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
          >
            View calendar <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

function PrepControls({
  message,
  messageKey,
  onPickChoice,
  onAnswerQuestion,
  onRunCta,
  ctaBusy,
  generatingMonth,
}) {
  const questions = Array.isArray(message.questions) ? message.questions : []
  const choices = Array.isArray(message.choices) ? message.choices : []
  const showCta = message.cta?.action === 'start_generation'

  if (!choices.length && !questions.length && !showCta) return null

  return (
    <div className="mt-3 pt-3 border-t border-fog/70 space-y-3">
      {choices.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {choices.map((choice) => (
            <button
              key={choice.id}
              onClick={() => onPickChoice(choice)}
              className="text-xs px-3 py-1.5 rounded-xl border border-fog bg-surface text-ink/70 hover:border-brand-300 hover:text-ink transition-colors"
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}

      {questions.length > 0 && (
        <div className="space-y-2">
          {questions.map((question) => (
            <div key={question.id} className="rounded-xl border border-fog bg-surface px-3 py-2.5">
              <p className="text-xs font-medium text-ink/75 mb-2">{question.prompt}</p>
              {question.input_type === 'upload' ? (
                <p className="text-[11px] text-ink/45">
                  Attach the matching screenshot or recording from the composer below, and I will fold it into the plan.
                </p>
              ) : question.options?.length ? (
                <div className="flex flex-wrap gap-2">
                  {question.options.map((option) => (
                    <button
                      key={option}
                      onClick={() => onAnswerQuestion(question, option)}
                      className="text-[11px] px-2.5 py-1.5 rounded-lg border border-fog bg-mist text-ink/70 hover:border-brand-300 hover:text-ink transition-colors"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {showCta && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onRunCta(message, messageKey)}
            disabled={ctaBusy || generatingMonth}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            <ArrowRight size={12} />
            {generatingMonth ? 'Generating…' : (message.cta?.label || 'Approve plan and generate')}
          </button>
          <span className="text-[11px] text-ink/35">Review the plan first, then launch generation.</span>
        </div>
      )}
    </div>
  )
}

function UserBubble({ message }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-2xl rounded-tr-sm px-4 py-3 bg-slate-900 text-white text-sm leading-relaxed">
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
}

function EmptyState({ onSuggestion }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-8 px-6 pb-16">
      {/* Logo mark */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
          <Sparkles size={26} className="text-white" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-ink">ContentCard AI</h2>
          <p className="text-sm text-ink/50 mt-0.5">Build the month plan first, then generate better posts</p>
        </div>
      </div>

      {/* Suggestion chips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className="text-left px-4 py-3 rounded-xl border border-fog bg-surface hover:bg-mist hover:border-brand-300 transition-all duration-200 text-sm text-ink/70 hover:text-ink group"
          >
            <span className="line-clamp-2">{s}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AssistantPage({ embedded = false }) {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const {
    activeBrandId,
    brands,
    generateMonth,
    generatingMonth,
    generationPollCount,
    generationProgress,
  } = useAppStore()
  const activeBrand = brands.find((b) => b.id === activeBrandId)

  const now = new Date()
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)   // 1-indexed
  const [selYear]               = useState(now.getFullYear())
  const [selPlatform, setSelPlatform] = useState('instagram')

  const [messages, setMessages] = useState([])                    // { role, content, type? }
  const [input, setInput]       = useState('')
  const [thinking, setThinking] = useState(false)
  const [browsing, setBrowsing] = useState(false)
  const [prepUploadingAsset, setPrepUploadingAsset] = useState(false)
  const [ctaBusy, setCtaBusy] = useState(false)
  const [authModal, setAuthModal] = useState({ open: false, mode: 'signup' })

  const chatEndRef   = useRef(null)
  const textareaRef  = useRef(null)
  const browsingTimer = useRef(null)
  const isGuestMode = !isAuthenticated

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  // Cleanup on unmount
  useEffect(() => () => clearTimeout(browsingTimer.current), [])

  const appendMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg])
  }, [])

  const openAuth = useCallback((mode = 'signup') => {
    setAuthModal({ open: true, mode })
  }, [])

  const promptGuestAccess = useCallback((message, mode = 'signup') => {
    appendMessage({
      role: 'assistant',
      type: 'message',
      content: message,
    })
    openAuth(mode)
  }, [appendMessage, openAuth])

  const updateLastAssistantMessage = useCallback((updates) => {
    setMessages((prev) => {
      const copy = [...prev]
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === 'assistant') {
          copy[i] = { ...copy[i], ...updates }
          return copy
        }
      }
      return copy
    })
  }, [])

  const handleGenerate = useCallback(
    async (chatMessages, month, year, platform) => {
      if (isGuestMode) {
        promptGuestAccess(
          'You are in guest mode. Log in or create an account to generate real posts, save this workspace, and open the calendar.',
          'signup'
        )
        return
      }

      const brief = buildBrief(chatMessages)
      const campaignBrief = buildCampaignBrief({
        brand: activeBrand,
        messages: chatMessages,
        platform,
        monthLabel: `${MONTHS[month - 1]} ${year}`,
      })

      // Show inline progress message
      const progressMsg = {
        role: 'assistant',
        type: 'progress',
        content: `Generating your ${MONTHS[month - 1]} ${year} posts for ${
          PLATFORMS.find((p) => p.id === platform)?.label ?? platform
        }…`,
      }
      appendMessage(progressMsg)

      try {
        await generateMonth({
          month,
          year,
          platforms: [platform],
          format_mix: 'mixed',
          posts_per_week: 3,
          generation_brief: brief,
          campaign_brief: campaignBrief,
          confirm_duplicate: false,
        })

        updateLastAssistantMessage({
          type: 'done',
          content: `Your posts for ${MONTHS[month - 1]} are ready! Head to the calendar to review them.`,
        })
      } catch (err) {
        const detail = err?.response?.data?.detail || err?.message || 'Generation failed'
        updateLastAssistantMessage({
          type: 'error',
          content: `Sorry, something went wrong: ${detail}`,
        })
      }
    },
    [activeBrand, appendMessage, generateMonth, isGuestMode, promptGuestAccess, updateLastAssistantMessage],
  )

  const sendMessage = useCallback(
    async (text) => {
      const txt = (text ?? input).trim()
      if (!txt || thinking) return

      setInput('')

      const userMsg = { role: 'user', content: txt }
      const nextMessages = [...messages, userMsg]
      setMessages(nextMessages)

      if (isGuestMode) {
        promptGuestAccess(
          'This assistant is in guest mode right now. Log in or sign up to run this prompt for real, generate your month, and keep the workspace.',
          'signup'
        )
        return
      }

      setThinking(true)

      // Show "browsing" pill for up to 2s, hide when response arrives
      setBrowsing(true)
      browsingTimer.current = setTimeout(() => setBrowsing(false), 2000)

      try {
        const data = await contentApi.generationPrepChat({
          brand_id: activeBrandId,
          month: selMonth,
          year: selYear,
          messages: nextMessages,
          enable_web_search: true,
        })

        clearTimeout(browsingTimer.current)
        setBrowsing(false)
        setThinking(false)

        const assistantMsg = {
          role: 'assistant',
          type: 'message',
          content: data.message || '',
          choices: data.choices || [],
          questions: data.questions || [],
          cta: data.cta || null,
        }
        setMessages((prev) => [...prev, assistantMsg])
      } catch (err) {
        clearTimeout(browsingTimer.current)
        setBrowsing(false)
        setThinking(false)

        const detail = err?.response?.data?.detail || err?.message || 'Something went wrong'
        appendMessage({
          role: 'assistant',
          type: 'error',
          content: `Sorry, I couldn't process that: ${detail}`,
        })
      }
    },
    [
      activeBrandId,
      appendMessage,
      input,
      isGuestMode,
      messages,
      promptGuestAccess,
      selMonth,
      selYear,
      selPlatform,
      thinking,
    ],
  )

  const handlePickChoice = useCallback(
    async (choice) => {
      const label = String(choice?.label || '').trim()
      if (!label) return
      await sendMessage(label)
    },
    [sendMessage],
  )

  const handleAnswerQuestion = useCallback(
    async (question, value) => {
      const prompt = String(question?.prompt || '').trim()
      const answer = String(value || '').trim()
      if (!answer) return
      const payload = prompt ? `${prompt}\nAnswer: ${answer}` : `Answer: ${answer}`
      await sendMessage(payload)
    },
    [sendMessage],
  )

  const handleUploadAsset = useCallback(
    async (file) => {
      if (isGuestMode) {
        promptGuestAccess(
          'Guest mode lets you explore the AI workspace. Log in or sign up to attach screenshots and recordings to your brief.',
          'login'
        )
        return
      }
      if (!file || !activeBrandId || prepUploadingAsset) return
      const isVideo = String(file.type || '').startsWith('video/')
      setPrepUploadingAsset(true)
      try {
        const res = await uploadApi.prepAsset(file, isVideo ? 'recording' : 'screenshot')
        const kind = res?.kind || (isVideo ? 'recording' : 'screenshot')
        const url = String(res?.url || '').trim()
        if (!url) throw new Error('No uploaded URL returned')
        await sendMessage(`Attached ${kind}: ${url}`)
      } catch (err) {
        appendMessage({
          role: 'assistant',
          type: 'error',
          content: `Sorry, I couldn't upload that asset: ${err?.response?.data?.detail || err?.message || 'Upload failed'}`,
        })
      } finally {
        setPrepUploadingAsset(false)
      }
    },
    [activeBrandId, appendMessage, isGuestMode, prepUploadingAsset, promptGuestAccess, sendMessage],
  )

  const handleRunCta = useCallback(
    async () => {
      if (ctaBusy || generatingMonth || thinking || messages.length === 0) return
      setCtaBusy(true)
      try {
        await handleGenerate(messages, selMonth, selYear, selPlatform)
      } finally {
        setCtaBusy(false)
      }
    },
    [ctaBusy, generatingMonth, handleGenerate, messages, selMonth, selYear, selPlatform, thinking],
  )

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleReset = () => {
    setMessages([])
    setInput('')
    setThinking(false)
    setBrowsing(false)
    clearTimeout(browsingTimer.current)
  }

  return (
    <div className="flex flex-col min-h-full bg-surface">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      {!embedded && (
        <header className="sticky top-0 z-20 flex items-center justify-between px-5 py-3.5 border-b border-fog bg-surface/90 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
              <Sparkles size={14} className="text-white" />
            </div>
            <div>
              <span className="font-semibold text-ink text-sm">ContentCard AI</span>
              <span className="ml-2 text-xs text-ink/40">
                {isGuestMode ? 'Guest mode' : activeBrand?.name || 'Workspace'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Month selector */}
            <select
              value={selMonth}
              onChange={(e) => setSelMonth(Number(e.target.value))}
              className="text-xs bg-mist border border-fog rounded-lg px-2.5 py-1.5 text-ink focus:outline-none focus:ring-2 focus:ring-brand-300/40 focus:border-brand-400 transition-all cursor-pointer"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m} {selYear}
                </option>
              ))}
            </select>

            {/* Platform toggle */}
            <div className="flex items-center gap-0.5 bg-mist border border-fog rounded-lg p-0.5">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelPlatform(p.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
                    selPlatform === p.id
                      ? 'bg-surface shadow-sm text-ink'
                      : 'text-ink/40 hover:text-ink/70'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Reset */}
            {messages.length > 0 && (
              <button
                onClick={handleReset}
                title="Start new chat"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-ink/40 hover:text-ink hover:bg-mist transition-all"
              >
                <RotateCcw size={14} />
              </button>
            )}
          </div>
        </header>
      )}

      {embedded && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-fog bg-surface">
          <div className="flex items-center gap-2">
            <select
              value={selMonth}
              onChange={(e) => setSelMonth(Number(e.target.value))}
              className="text-xs bg-mist border border-fog rounded-lg px-2.5 py-1.5 text-ink focus:outline-none focus:ring-2 focus:ring-brand-300/40 focus:border-brand-400 transition-all cursor-pointer"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m} {selYear}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-0.5 bg-mist border border-fog rounded-lg p-0.5 overflow-x-auto">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelPlatform(p.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                    selPlatform === p.id
                      ? 'bg-surface shadow-sm text-ink'
                      : 'text-ink/40 hover:text-ink/70'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleReset}
              title="Start new chat"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-ink/40 hover:text-ink hover:bg-mist transition-all"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      )}

      {/* ── Chat area ────────────────────────────────────────────────────── */}
      <div className="flex-1">
        {messages.length === 0 && !thinking ? (
          <EmptyState onSuggestion={(s) => sendMessage(s)} />
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5 pb-36">
            {messages.map((msg, idx) =>
              msg.role === 'user' ? (
                <UserBubble key={idx} message={msg} />
              ) : (
                <div key={idx}>
                  <AssistantBubble
                    message={msg}
                    onNavigate={
                      msg.type === 'done'
                        ? () => navigate('/dashboard/calendar')
                        : null
                    }
                  />
                  {msg.type !== 'progress' && msg.type !== 'done' && msg.type !== 'error' && (
                    <div className="ml-10 -mt-2">
                      <PrepControls
                        message={msg}
                        messageKey={idx}
                        onPickChoice={handlePickChoice}
                        onAnswerQuestion={handleAnswerQuestion}
                        onRunCta={handleRunCta}
                        ctaBusy={ctaBusy}
                        generatingMonth={generatingMonth}
                      />
                    </div>
                  )}
                </div>
              ),
            )}

            {/* Typing / browsing indicator */}
            {thinking && <TypingIndicator browsing={browsing} />}

            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* ── Input bar — sticky at the bottom of the scroll container ─────── */}
      <div className="sticky bottom-0 border-t border-fog bg-surface/95 backdrop-blur-sm px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="mb-2 flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-[11px] text-ink/45">
              <input
                type="file"
                accept="image/*,video/mp4,video/webm,video/quicktime"
                disabled={thinking || generatingMonth || prepUploadingAsset || (!activeBrandId && !isGuestMode)}
                onChange={(e) => handleUploadAsset(e.target.files?.[0] || null)}
                className="hidden"
              />
              <span className="cursor-pointer rounded-lg border border-fog bg-surface px-2.5 py-1.5 font-medium text-ink/60 hover:border-brand-300 hover:text-ink transition-colors">
                {prepUploadingAsset ? 'Uploading…' : '+ Attach screenshot or recording'}
              </span>
            </label>
          </div>
          <div className="flex items-end gap-2 bg-mist border border-fog rounded-2xl px-4 py-3 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-300/30 transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isGuestMode
                  ? 'Try the AI in guest mode, then log in or sign up to generate for real…'
                  : 'Tell me the offer, launch, event, proof, or assets for this month…'
              }
              disabled={thinking || generatingMonth || prepUploadingAsset}
              className="flex-1 resize-none bg-transparent text-sm text-ink placeholder:text-ink/40 focus:outline-none leading-relaxed disabled:opacity-50 min-h-[22px] max-h-[160px]"
            />

            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || thinking || generatingMonth || prepUploadingAsset}
              className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200
                bg-slate-900 text-white hover:bg-slate-800 shadow-sm
                disabled:bg-fog disabled:text-ink/30 disabled:shadow-none disabled:cursor-not-allowed"
            >
              <Send size={14} />
            </button>
          </div>

          <p className="mt-1.5 text-center text-[11px] text-ink/30">
            {isGuestMode
              ? 'Guest mode preview · log in or sign up when you are ready to generate'
              : <><kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift+Enter</kbd> for new line</>}
          </p>
        </div>
      </div>

      <AuthEntryModal
        open={authModal.open}
        mode={authModal.mode}
        onClose={() => setAuthModal((current) => ({ ...current, open: false }))}
      />
    </div>
  )
}
