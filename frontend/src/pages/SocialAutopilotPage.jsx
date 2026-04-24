import { useEffect, useMemo, useState } from 'react'
import useAppStore from '../stores/appStore'
import { socialApi } from '../api'
import { toast } from '../components/ui/Toast'

const SOCIAL_AUTOPILOT_SHOWCASE_MODE = true
const PLATFORM_OPTIONS = ['instagram', 'facebook', 'linkedin']
const MODE_OPTIONS = ['manual_only', 'approval_required', 'smart_autopilot']

const inputCls = 'w-full px-3 py-2.5 bg-mist border border-fog rounded-xl text-sm text-ink outline-none focus:ring-2 focus:ring-brand-400/40'

export default function SocialAutopilotPage() {
  const { activeBrandId, brands } = useAppStore()
  const activeBrand = useMemo(() => brands.find((b) => b.id === activeBrandId) || null, [brands, activeBrandId])

  const [loading, setLoading] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [connectingPlatform, setConnectingPlatform] = useState('')
  const [connections, setConnections] = useState([])
  const [connectionHealth, setConnectionHealth] = useState([])
  const [opsAlerts, setOpsAlerts] = useState(null)
  const [posts, setPosts] = useState([])
  const [deadLetterPosts, setDeadLetterPosts] = useState([])
  const [comments, setComments] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [replyDrafts, setReplyDrafts] = useState({})
  const [replySubmittingId, setReplySubmittingId] = useState('')
  const [preflightRunning, setPreflightRunning] = useState(false)
  const [preflightResult, setPreflightResult] = useState(null)
  const [preflightForm, setPreflightForm] = useState({
    platform: 'instagram',
    content_item_id: '',
    caption: '',
    media_urls: '',
    quality_score: '',
    compliance_flags: '',
    scheduled_slot: '',
  })
  const [config, setConfig] = useState({
    brand_id: '',
    mode: 'approval_required',
    max_posts_per_day: 2,
    min_gap_hours: 4,
    quiet_hours_start: '22:00',
    quiet_hours_end: '07:00',
    timezone_name: 'UTC',
    kill_switch: false,
    hashtag_cap: 12,
    forbidden_hashtags: '',
    allowed_domains: '',
    require_disclaimer: false,
    required_disclaimer_text: '',
    circuit_breaker_failure_threshold: 5,
    circuit_breaker_window_minutes: 30,
    circuit_breaker_cooldown_minutes: 30,
  })

  const comingSoonAction = () => {
    toast('Coming soon', 'success')
  }

  const loadAll = async (brandId) => {
    if (!brandId) return
    setLoading(true)
    try {
      const [connRows, healthRows, autopilotCfg, postRows, deadRows, commentRows, metricSummary, alerts] = await Promise.all([
        socialApi.listConnections(brandId),
        socialApi.connectionHealth(brandId),
        socialApi.getAutopilotConfig(brandId),
        socialApi.listPosts({ brand_id: brandId, limit: 50 }),
        socialApi.deadLetterPosts(brandId, 50),
        socialApi.listComments(brandId, 50),
        socialApi.metricsSummary(brandId, 30),
        socialApi.opsAlerts(brandId),
      ])
      setConnections(connRows || [])
      setConnectionHealth(healthRows || [])
      setPosts(postRows || [])
      setDeadLetterPosts(deadRows || [])
      setComments(commentRows || [])
      setMetrics(metricSummary || null)
      setOpsAlerts(alerts || null)
      if (autopilotCfg && typeof autopilotCfg === 'object') {
        setConfig({
          brand_id: brandId,
          mode: autopilotCfg.mode || 'approval_required',
          max_posts_per_day: Number(autopilotCfg.max_posts_per_day || 2),
          min_gap_hours: Number(autopilotCfg.min_gap_hours || 4),
          quiet_hours_start: autopilotCfg.quiet_hours_start || '22:00',
          quiet_hours_end: autopilotCfg.quiet_hours_end || '07:00',
          timezone_name: autopilotCfg.timezone_name || 'UTC',
          kill_switch: !!autopilotCfg.kill_switch,
          hashtag_cap: Number(autopilotCfg.hashtag_cap || 12),
          forbidden_hashtags: (autopilotCfg.forbidden_hashtags || []).join(', '),
          allowed_domains: (autopilotCfg.allowed_domains || []).join(', '),
          require_disclaimer: !!autopilotCfg.require_disclaimer,
          required_disclaimer_text: autopilotCfg.required_disclaimer_text || '',
          circuit_breaker_failure_threshold: Number(autopilotCfg.circuit_breaker_failure_threshold || 5),
          circuit_breaker_window_minutes: Number(autopilotCfg.circuit_breaker_window_minutes || 30),
          circuit_breaker_cooldown_minutes: Number(autopilotCfg.circuit_breaker_cooldown_minutes || 30),
        })
      }
      setReplyDrafts(
        Object.fromEntries((commentRows || []).map((c) => [c.id, c.reply_text || c.suggested_reply || '']))
      )
    } catch (err) {
      toast(err?.response?.data?.detail || err.message || 'Could not load social autopilot data', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!activeBrandId) return
    setConfig((prev) => ({ ...prev, brand_id: activeBrandId }))
    loadAll(activeBrandId)
  }, [activeBrandId])

  const startOAuth = async (platform) => {
    if (SOCIAL_AUTOPILOT_SHOWCASE_MODE) {
      comingSoonAction()
      return
    }
    if (!activeBrandId) {
      toast('Select a brand first', 'error')
      return
    }
    setConnectingPlatform(platform)
    try {
      const out = await socialApi.oauthStart(platform, { brand_id: activeBrandId })
      if (!out?.authorization_url) throw new Error('No authorization URL returned')
      window.location.href = out.authorization_url
    } catch (err) {
      toast(err?.response?.data?.detail || err.message || `Could not start ${platform} OAuth`, 'error')
    } finally {
      setConnectingPlatform('')
    }
  }

  const disconnectPlatform = async (platform) => {
    if (SOCIAL_AUTOPILOT_SHOWCASE_MODE) {
      comingSoonAction()
      return
    }
    if (!activeBrandId) return
    try {
      await socialApi.disconnect(platform, { brand_id: activeBrandId })
      toast(`${platform} disconnected`, 'success')
      await loadAll(activeBrandId)
    } catch (err) {
      toast(err?.response?.data?.detail || err.message || `Could not disconnect ${platform}`, 'error')
    }
  }

  const saveAutopilotConfig = async () => {
    if (SOCIAL_AUTOPILOT_SHOWCASE_MODE) {
      comingSoonAction()
      return
    }
    if (!activeBrandId) return
    setSavingConfig(true)
    try {
      const forbiddenHashtags = String(config.forbidden_hashtags || '')
        .split(',')
        .map((x) => x.trim().replace(/^#/, ''))
        .filter(Boolean)
      const allowedDomains = String(config.allowed_domains || '')
        .split(',')
        .map((x) => x.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0])
        .filter(Boolean)
      await socialApi.upsertAutopilotConfig({
        ...config,
        brand_id: activeBrandId,
        forbidden_hashtags: forbiddenHashtags,
        allowed_domains: allowedDomains,
      })
      toast('Autopilot settings saved', 'success')
      await loadAll(activeBrandId)
    } catch (err) {
      toast(err?.response?.data?.detail || err.message || 'Could not save autopilot settings', 'error')
    } finally {
      setSavingConfig(false)
    }
  }

  const submitReply = async (commentId, sendNow) => {
    if (SOCIAL_AUTOPILOT_SHOWCASE_MODE) {
      comingSoonAction()
      return
    }
    const replyText = String(replyDrafts[commentId] || '').trim()
    if (!replyText) {
      toast('Enter a reply before submitting', 'error')
      return
    }
    setReplySubmittingId(commentId)
    try {
      await socialApi.replyToComment(commentId, { reply_text: replyText, send_now: !!sendNow })
      toast(sendNow ? 'Reply marked as sent' : 'Reply approved', 'success')
      if (activeBrandId) await loadAll(activeBrandId)
    } catch (err) {
      toast(err?.response?.data?.detail || err.message || 'Could not update reply', 'error')
    } finally {
      setReplySubmittingId('')
    }
  }

  const runPreflightTest = async () => {
    if (SOCIAL_AUTOPILOT_SHOWCASE_MODE) {
      comingSoonAction()
      return
    }
    if (!activeBrandId) return
    setPreflightRunning(true)
    setPreflightResult(null)
    try {
      const mediaUrls = String(preflightForm.media_urls || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
      const complianceFlags = String(preflightForm.compliance_flags || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
      const payload = {
        brand_id: activeBrandId,
        platform: preflightForm.platform,
        content_item_id: preflightForm.content_item_id.trim() || null,
        scheduled_slot: preflightForm.scheduled_slot ? new Date(preflightForm.scheduled_slot).toISOString() : null,
        caption: preflightForm.caption || '',
        media_urls: mediaUrls,
        quality_score: preflightForm.quality_score === '' ? null : Number(preflightForm.quality_score),
        compliance_flags: complianceFlags,
      }
      const out = await socialApi.preflight(payload)
      setPreflightResult(out)
      if (activeBrandId) await loadAll(activeBrandId)
    } catch (err) {
      toast(err?.response?.data?.detail || err.message || 'Preflight test failed', 'error')
    } finally {
      setPreflightRunning(false)
    }
  }

  const queueFromForm = async () => {
    if (SOCIAL_AUTOPILOT_SHOWCASE_MODE) {
      comingSoonAction()
      return
    }
    if (!activeBrandId) return
    try {
      const mediaUrls = String(preflightForm.media_urls || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
      const payload = {
        brand_id: activeBrandId,
        platform: preflightForm.platform,
        content_item_id: preflightForm.content_item_id.trim() || null,
        caption: preflightForm.caption || '',
        media_urls: mediaUrls,
        scheduled_slot: preflightForm.scheduled_slot ? new Date(preflightForm.scheduled_slot).toISOString() : null,
      }
      await socialApi.queuePost(payload)
      toast('Post queued successfully', 'success')
      await loadAll(activeBrandId)
    } catch (err) {
      toast(err?.response?.data?.detail || err.message || 'Could not queue post', 'error')
    }
  }

  const retryDeadLetterPost = async (postId) => {
    if (SOCIAL_AUTOPILOT_SHOWCASE_MODE) {
      comingSoonAction()
      return
    }
    try {
      await socialApi.retryPost(postId)
      toast('Post re-queued from dead-letter', 'success')
      if (activeBrandId) await loadAll(activeBrandId)
    } catch (err) {
      toast(err?.response?.data?.detail || err.message || 'Could not retry post', 'error')
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Social Autopilot</h1>
        <p className="text-ink/40 text-sm">
          Connect accounts, control autopilot safety rules, and monitor social publish + comment activity.
        </p>
      </div>

      {!activeBrand ? (
        <div className="bg-surface border border-fog rounded-2xl p-6 text-sm text-ink/55">
          Select a brand from your workspace to configure social autopilot.
        </div>
      ) : (
        <>
          <div className="bg-surface border border-fog rounded-2xl p-5">
            <h2 className="text-sm font-bold text-ink mb-3">Social Accounts · {activeBrand.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {PLATFORM_OPTIONS.map((platform) => {
                const conn = connections.find((c) => c.platform === platform)
                const health = connectionHealth.find((h) => h.platform === platform)
                return (
                  <div key={platform} className="border border-fog rounded-xl p-3 bg-mist/70">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-ink capitalize">{platform}</p>
                      <span className={`text-[11px] px-2 py-1 rounded-full border ${
                        conn?.status === 'connected'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {conn?.status || 'not connected'}
                      </span>
                    </div>
                    <p className="text-xs text-ink/45 mb-3 truncate">
                      {conn?.account_name || conn?.account_id || 'No account linked yet'}
                    </p>
                    {health?.warning && (
                      <p className={`text-[11px] mb-2 ${health.needs_reconnect ? 'text-amber-700' : 'text-ink/45'}`}>
                        {health.warning}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startOAuth(platform)}
                        disabled={connectingPlatform === platform}
                        className="px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold disabled:opacity-60"
                      >
                        {connectingPlatform === platform ? 'Connecting…' : conn ? 'Reconnect' : 'Connect'}
                      </button>
                      {conn && (
                        <button
                          type="button"
                          onClick={() => disconnectPlatform(platform)}
                          className="px-3 py-2 rounded-lg border border-fog text-ink/65 hover:text-ink text-xs font-semibold"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-surface border border-fog rounded-2xl p-5">
            <h2 className="text-sm font-bold text-ink mb-3">Autopilot Safety Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Mode</label>
                <select
                  value={config.mode}
                  onChange={(e) => setConfig((p) => ({ ...p, mode: e.target.value }))}
                  className={inputCls}
                >
                  {MODE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Daily max posts</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={config.max_posts_per_day}
                  onChange={(e) => setConfig((p) => ({ ...p, max_posts_per_day: Number(e.target.value || 1) }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Min gap (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={config.min_gap_hours}
                  onChange={(e) => setConfig((p) => ({ ...p, min_gap_hours: Number(e.target.value || 1) }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Timezone</label>
                <input
                  value={config.timezone_name}
                  onChange={(e) => setConfig((p) => ({ ...p, timezone_name: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Quiet start</label>
                <input
                  value={config.quiet_hours_start}
                  onChange={(e) => setConfig((p) => ({ ...p, quiet_hours_start: e.target.value }))}
                  placeholder="22:00"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Quiet end</label>
                <input
                  value={config.quiet_hours_end}
                  onChange={(e) => setConfig((p) => ({ ...p, quiet_hours_end: e.target.value }))}
                  placeholder="07:00"
                  className={inputCls}
                />
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm text-ink/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.kill_switch}
                    onChange={(e) => setConfig((p) => ({ ...p, kill_switch: e.target.checked }))}
                  />
                  Kill switch
                </label>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Hashtag cap</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={config.hashtag_cap}
                  onChange={(e) => setConfig((p) => ({ ...p, hashtag_cap: Number(e.target.value || 1) }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Forbidden hashtags</label>
                <input
                  value={config.forbidden_hashtags}
                  onChange={(e) => setConfig((p) => ({ ...p, forbidden_hashtags: e.target.value }))}
                  className={inputCls}
                  placeholder="spam, giveaway, followforfollow"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Allowed domains</label>
                <input
                  value={config.allowed_domains}
                  onChange={(e) => setConfig((p) => ({ ...p, allowed_domains: e.target.value }))}
                  className={inputCls}
                  placeholder="example.com, docs.example.com"
                />
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm text-ink/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.require_disclaimer}
                    onChange={(e) => setConfig((p) => ({ ...p, require_disclaimer: e.target.checked }))}
                  />
                  Require disclaimer text
                </label>
              </div>
              {config.require_disclaimer && (
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Disclaimer text</label>
                  <input
                    value={config.required_disclaimer_text}
                    onChange={(e) => setConfig((p) => ({ ...p, required_disclaimer_text: e.target.value }))}
                    className={inputCls}
                    placeholder="Ad: terms and conditions apply"
                  />
                </div>
              )}
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">CB failure threshold</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={config.circuit_breaker_failure_threshold}
                  onChange={(e) => setConfig((p) => ({ ...p, circuit_breaker_failure_threshold: Number(e.target.value || 1) }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">CB window (minutes)</label>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={config.circuit_breaker_window_minutes}
                  onChange={(e) => setConfig((p) => ({ ...p, circuit_breaker_window_minutes: Number(e.target.value || 5) }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">CB cooldown (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={config.circuit_breaker_cooldown_minutes}
                  onChange={(e) => setConfig((p) => ({ ...p, circuit_breaker_cooldown_minutes: Number(e.target.value || 1) }))}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={saveAutopilotConfig}
                disabled={savingConfig}
                className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold disabled:opacity-60"
              >
                {savingConfig ? 'Saving…' : 'Save Autopilot Settings'}
              </button>
            </div>
          </div>

          <div className="bg-surface border border-fog rounded-2xl p-5">
            <h2 className="text-sm font-bold text-ink mb-3">Operational Alerts</h2>
            {!opsAlerts ? (
              <p className="text-sm text-ink/45">No alerts loaded.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-ink/70">
                  Invalid webhook signatures (24h): <strong className="text-ink">{opsAlerts.invalid_webhook_signature_count_24h || 0}</strong>
                </p>
                {(opsAlerts.token_expiry_warnings || []).length > 0 ? (
                  <div className="space-y-1">
                    {(opsAlerts.token_expiry_warnings || []).map((w, idx) => (
                      <p key={`${w.platform}-${idx}`} className="text-amber-700">
                        Token warning: {w.platform} expires in {w.hours_remaining}h
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-ink/45">No token expiry warnings.</p>
                )}
                {(opsAlerts.consecutive_failure_alerts || []).length > 0 ? (
                  <div className="space-y-1">
                    {(opsAlerts.consecutive_failure_alerts || []).map((a, idx) => (
                      <p key={`${a.platform}-${idx}`} className="text-red-600">
                        Failure streak: {a.platform} has {a.consecutive_failures} consecutive failures.
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-ink/45">No consecutive failure alerts.</p>
                )}
              </div>
            )}
          </div>

          <div className="bg-surface border border-fog rounded-2xl p-5">
            <h2 className="text-sm font-bold text-ink mb-3">Preflight Test Tool</h2>
            <p className="text-xs text-ink/45 mb-3">
              Use this to validate whether a post would pass current safety gates before n8n executes publish.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Platform</label>
                <select
                  value={preflightForm.platform}
                  onChange={(e) => setPreflightForm((p) => ({ ...p, platform: e.target.value }))}
                  className={inputCls}
                >
                  {PLATFORM_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Content item ID (optional)</label>
                <input
                  value={preflightForm.content_item_id}
                  onChange={(e) => setPreflightForm((p) => ({ ...p, content_item_id: e.target.value }))}
                  className={inputCls}
                  placeholder="uuid"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Quality score</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={preflightForm.quality_score}
                  onChange={(e) => setPreflightForm((p) => ({ ...p, quality_score: e.target.value }))}
                  className={inputCls}
                  placeholder="0.72"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Scheduled slot (optional)</label>
                <input
                  type="datetime-local"
                  value={preflightForm.scheduled_slot}
                  onChange={(e) => setPreflightForm((p) => ({ ...p, scheduled_slot: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Caption</label>
                <textarea
                  value={preflightForm.caption}
                  onChange={(e) => setPreflightForm((p) => ({ ...p, caption: e.target.value }))}
                  className={`${inputCls} min-h-[90px]`}
                  placeholder="Post caption to evaluate"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Media URLs (one per line)</label>
                <textarea
                  value={preflightForm.media_urls}
                  onChange={(e) => setPreflightForm((p) => ({ ...p, media_urls: e.target.value }))}
                  className={`${inputCls} min-h-[90px]`}
                  placeholder="https://..."
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-1.5">Compliance flags (comma-separated)</label>
                <input
                  value={preflightForm.compliance_flags}
                  onChange={(e) => setPreflightForm((p) => ({ ...p, compliance_flags: e.target.value }))}
                  className={inputCls}
                  placeholder="missing_disclaimer,banned_phrase"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={runPreflightTest}
                disabled={preflightRunning}
                className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold disabled:opacity-60"
              >
                {preflightRunning ? 'Running…' : 'Run Preflight Test'}
              </button>
              <button
                type="button"
                onClick={queueFromForm}
                className="px-4 py-2.5 rounded-xl border border-fog text-ink/70 hover:text-ink text-sm font-semibold"
              >
                Queue Post
              </button>
              {preflightResult && (
                <span className={`text-xs px-2 py-1 rounded-full border ${
                  preflightResult.allowed
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {preflightResult.allowed ? 'Allowed' : 'Blocked'} · {preflightResult.reason || 'OK'}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="bg-surface border border-fog rounded-2xl p-5 xl:col-span-1">
              <h3 className="text-sm font-bold text-ink mb-3">30-day Metrics</h3>
              {metrics ? (
                <div className="space-y-1 text-sm text-ink/70">
                  <p>Posted: <strong className="text-ink">{metrics?.totals?.posted || 0}</strong></p>
                  <p>Impressions: <strong className="text-ink">{metrics?.totals?.impressions || 0}</strong></p>
                  <p>Reach: <strong className="text-ink">{metrics?.totals?.reach || 0}</strong></p>
                  <p>Engagement: <strong className="text-ink">{metrics?.totals?.engagement || 0}</strong></p>
                  <p>Clicks: <strong className="text-ink">{metrics?.totals?.clicks || 0}</strong></p>
                </div>
              ) : (
                <p className="text-sm text-ink/45">No metrics yet.</p>
              )}
            </div>

            <div className="bg-surface border border-fog rounded-2xl p-5 xl:col-span-2">
              <h3 className="text-sm font-bold text-ink mb-3">Publish Ledger</h3>
              {loading ? (
                <p className="text-sm text-ink/45">Loading posts…</p>
              ) : posts.length === 0 ? (
                <p className="text-sm text-ink/45">No publish attempts yet.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {posts.map((row) => (
                    <div key={row.id} className="border border-fog rounded-lg p-2.5 bg-mist/70">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-ink font-medium capitalize">{row.platform}</p>
                        <span className="text-[11px] px-2 py-0.5 rounded-full border bg-surface border-fog text-ink/70">{row.status}</span>
                      </div>
                      <p className="text-xs text-ink/45 truncate">{row.status_reason || 'No reason provided'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-surface border border-fog rounded-2xl p-5">
            <h3 className="text-sm font-bold text-ink mb-3">Dead-letter Queue</h3>
            {deadLetterPosts.length === 0 ? (
              <p className="text-sm text-ink/45">No failed posts in dead-letter.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {deadLetterPosts.map((row) => (
                  <div key={row.id} className="border border-fog rounded-lg p-2.5 bg-mist/70">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-ink font-medium capitalize">{row.platform}</p>
                      <button
                        type="button"
                        onClick={() => retryDeadLetterPost(row.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold"
                      >
                        Retry
                      </button>
                    </div>
                    <p className="text-xs text-ink/45 truncate">{row.status_reason || 'No failure reason'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-surface border border-fog rounded-2xl p-5">
            <h3 className="text-sm font-bold text-ink mb-3">Recent Comments</h3>
            {comments.length === 0 ? (
              <p className="text-sm text-ink/45">No comments ingested yet.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {comments.map((c) => (
                  <div key={c.id} className="border border-fog rounded-lg p-2.5 bg-mist/70">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{c.author_name || 'Unknown author'}</p>
                      <span className="text-[11px] px-2 py-0.5 rounded-full border bg-surface border-fog text-ink/70">{c.reply_status}</span>
                    </div>
                    <p className="text-xs text-ink/65 mt-1">{c.comment_text}</p>
                    {c.suggested_reply && <p className="text-xs text-ink/45 mt-1">Suggestion: {c.suggested_reply}</p>}
                    <div className="mt-2 flex flex-col gap-2">
                      <textarea
                        value={replyDrafts[c.id] || ''}
                        onChange={(e) => setReplyDrafts((p) => ({ ...p, [c.id]: e.target.value }))}
                        placeholder="Write or edit reply..."
                        className={`${inputCls} min-h-[70px]`}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => submitReply(c.id, false)}
                          disabled={replySubmittingId === c.id}
                          className="px-3 py-2 rounded-lg border border-fog text-xs font-semibold text-ink/70 hover:text-ink disabled:opacity-60"
                        >
                          {replySubmittingId === c.id ? 'Saving…' : 'Approve Reply'}
                        </button>
                        <button
                          type="button"
                          onClick={() => submitReply(c.id, true)}
                          disabled={replySubmittingId === c.id}
                          className="px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold disabled:opacity-60"
                        >
                          {replySubmittingId === c.id ? 'Sending…' : 'Approve + Send'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
