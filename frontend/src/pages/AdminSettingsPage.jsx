import { useState } from 'react'
import { Check } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'

export default function AdminSettingsPage() {
  const [saved, setSaved] = useState(false)
  const [settings, setSettings] = useState({
    siteName: 'ContentCard',
    supportEmail: 'support@contentcard.io',
    trialDays: '14',
    maxBrandsStarter: '1',
    maxBrandsBusiness: '5',
    maxBrandsEnterprise: '20',
    maintenanceMode: false,
    signupsEnabled: true,
    aiModel: 'claude-3-5-sonnet-20241022',
  })

  const inp = "bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-500/40 w-full"

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-white/35 text-sm mt-0.5">Platform configuration</p>
      </div>

      <div className="max-w-2xl space-y-6">

        {/* General */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4">General</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-white/40 text-xs font-bold uppercase tracking-widest mb-2">Platform name</label>
              <input value={settings.siteName} onChange={e => setSettings(s => ({ ...s, siteName: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className="block text-white/40 text-xs font-bold uppercase tracking-widest mb-2">Support email</label>
              <input value={settings.supportEmail} onChange={e => setSettings(s => ({ ...s, supportEmail: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className="block text-white/40 text-xs font-bold uppercase tracking-widest mb-2">Default trial days</label>
              <input type="number" value={settings.trialDays} onChange={e => setSettings(s => ({ ...s, trialDays: e.target.value }))} className={inp} />
            </div>
          </div>
        </div>

        {/* Plan limits */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4">Brand limits per plan</h2>
          <div className="grid grid-cols-3 gap-4">
            {[['Starter', 'maxBrandsStarter'], ['Business', 'maxBrandsBusiness'], ['Enterprise', 'maxBrandsEnterprise']].map(([label, key]) => (
              <div key={key}>
                <label className="block text-white/40 text-xs font-bold uppercase tracking-widest mb-2">{label}</label>
                <input type="number" value={settings[key]} onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))} className={inp} />
              </div>
            ))}
          </div>
        </div>

        {/* AI */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4">AI configuration</h2>
          <div>
            <label className="block text-white/40 text-xs font-bold uppercase tracking-widest mb-2">Claude model</label>
            <select value={settings.aiModel} onChange={e => setSettings(s => ({ ...s, aiModel: e.target.value }))} className={inp}>
              <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet-20241022</option>
              <option value="claude-3-opus-20240229">claude-3-opus-20240229</option>
              <option value="claude-3-haiku-20240307">claude-3-haiku-20240307</option>
            </select>
          </div>
        </div>

        {/* Toggles */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4">Feature flags</h2>
          <div className="space-y-4">
            {[
              { key: 'signupsEnabled', label: 'New signups enabled', desc: 'Allow new users to create accounts' },
              { key: 'maintenanceMode', label: 'Maintenance mode', desc: 'Show maintenance page to all users' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <div className="text-white text-sm font-medium">{label}</div>
                  <div className="text-white/35 text-xs">{desc}</div>
                </div>
                <button onClick={() => setSettings(s => ({ ...s, [key]: !s[key] }))}
                  className={`w-11 h-6 rounded-full transition-all relative ${settings[key] ? 'bg-brand-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings[key] ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <button onClick={handleSave}
          className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2">
          {saved ? <><Check size={15} /> Saved!</> : 'Save settings'}
        </button>
      </div>
    </AdminLayout>
  )
}
