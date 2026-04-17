import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/ui/Toast'
import useAuthStore from './stores/authStore'
import useAppStore from './stores/appStore'

import LandingPage     from './pages/LandingPage'
import LoginPage       from './pages/LoginPage'
import SignupPage      from './pages/SignupPage'
import OnboardingPage  from './pages/OnboardingPage'
import AcceptInvite    from './pages/AcceptInvite'
import DashboardLayout from './components/layout/DashboardLayout'
import DashboardPage   from './pages/DashboardPage'
import GeneratePage    from './pages/GeneratePage'
import CalendarPage    from './pages/CalendarPage'
import BrandKitPage    from './pages/BrandKitPage'
import TemplatesPage   from './pages/TemplatesPage'
import SettingsPage    from './pages/SettingsPage'
import BillingPage     from './pages/BillingPage'

function PrivateRoute({ children }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function GuestRoute({ children }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children
}

// After signup: if user has no brands, send them to onboarding
function DashboardGuard({ children }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const { brands, activeWorkspaceId } = useAppStore()

  if (!isAuthenticated) return <Navigate to="/login" replace />
  // If workspaces/brands loaded and no brand exists, redirect to onboarding
  if (activeWorkspaceId && brands.length === 0) {
    return <Navigate to="/onboarding" replace />
  }
  return children
}

export default function App() {
  return (
    <>
      <ToastProvider />
      <Routes>
        <Route path="/"              element={<LandingPage />} />
        <Route path="/login"         element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/signup"        element={<GuestRoute><SignupPage /></GuestRoute>} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/onboarding"    element={<PrivateRoute><OnboardingPage /></PrivateRoute>} />

        <Route path="/dashboard" element={<DashboardGuard><DashboardLayout /></DashboardGuard>}>
          <Route index                 element={<DashboardPage />} />
          <Route path="generate"       element={<GeneratePage />} />
          <Route path="calendar"       element={<CalendarPage />} />
          <Route path="templates"      element={<TemplatesPage />} />
          <Route path="brand-kit"      element={<BrandKitPage />} />
          <Route path="settings"       element={<SettingsPage />} />
          <Route path="billing"        element={<BillingPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
