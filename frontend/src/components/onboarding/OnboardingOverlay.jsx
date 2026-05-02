import OnboardingPage from '../../pages/OnboardingPage'

/**
 * Renders the onboarding wizard as a full-screen overlay above the dashboard.
 *
 * Mounted from DashboardLayout when the signed-in user has no brand yet
 * (`user.onboarding_completed === false`). The wizard handles its own state
 * and, on completion, calls `updateUser({ onboarding_completed: true })`,
 * which causes this overlay to unmount automatically.
 */
export default function OnboardingOverlay() {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-mist">
      <OnboardingPage />
    </div>
  )
}
