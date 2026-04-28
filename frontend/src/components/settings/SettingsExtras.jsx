import ThemeToggle from '../ui/ThemeToggle'
import ReferralWidget from './ReferralWidget'
import { useFeatureFlag } from '../../lib/featureFlags'

export default function SettingsExtras() {
  const darkOn = useFeatureFlag('nav.dark_mode')
  const referralOn = useFeatureFlag('settings.referral_widget')
  if (!darkOn && !referralOn) return null
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      {darkOn && (
        <div className="bg-surface border border-fog rounded-2xl p-5">
          <p className="text-[10px] uppercase tracking-widest text-ink/45 font-bold mb-1">Appearance</p>
          <h3 className="text-ink font-semibold text-sm mb-3">Theme</h3>
          <ThemeToggle />
          <p className="text-ink/40 text-[11px] mt-2">System uses your OS preference. Saved per device.</p>
        </div>
      )}
      {referralOn && <ReferralWidget />}
    </div>
  )
}
