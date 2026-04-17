import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/ui/Toast'

import LandingPage          from './pages/LandingPage'
import LoginPage            from './pages/LoginPage'
import SignupPage           from './pages/SignupPage'
import OnboardingPage       from './pages/OnboardingPage'
import AcceptInvite         from './pages/AcceptInvite'
import ForgotPasswordPage   from './pages/ForgotPasswordPage'
import FeaturesPage         from './pages/FeaturesPage'
import PricingPage          from './pages/PricingPage'
import EnterprisePage       from './pages/EnterprisePage'
import DemoPage             from './pages/DemoPage'
import SolutionsPage        from './pages/SolutionsPage'
import AboutPage            from './pages/AboutPage'
import ContactPage          from './pages/ContactPage'
import BlogPage             from './pages/BlogPage'
import CareersPage          from './pages/CareersPage'
import ChangelogPage        from './pages/ChangelogPage'
import RoadmapPage          from './pages/RoadmapPage'
import LegalPage            from './pages/LegalPage'
import DashboardLayout      from './components/layout/DashboardLayout'
import DashboardPage        from './pages/DashboardPage'
import GeneratePage         from './pages/GeneratePage'
import CalendarPage         from './pages/CalendarPage'
import BrandKitPage         from './pages/BrandKitPage'
import TemplatesPage        from './pages/TemplatesPage'
import SettingsPage         from './pages/SettingsPage'
import BillingPage          from './pages/BillingPage'

function PrivateRoute({ children }) { return children }
function GuestRoute({ children })   { return children }
function DashboardGuard({ children }) { return children }

export default function App() {
  return (
    <>
      <ToastProvider />
      <Routes>
        {/* Marketing */}
        <Route path="/"                      element={<LandingPage />} />
        <Route path="/features"              element={<FeaturesPage />} />
        <Route path="/pricing"               element={<PricingPage />} />
        <Route path="/enterprise"            element={<EnterprisePage />} />
        <Route path="/demo"                  element={<DemoPage />} />
        <Route path="/solutions/:type"       element={<SolutionsPage />} />
        <Route path="/about"                 element={<AboutPage />} />
        <Route path="/contact"              element={<ContactPage />} />
        <Route path="/blog"                  element={<BlogPage />} />
        <Route path="/careers"              element={<CareersPage />} />
        <Route path="/changelog"            element={<ChangelogPage />} />
        <Route path="/roadmap"              element={<RoadmapPage />} />
        <Route path="/privacy"              element={<LegalPage />} />
        <Route path="/terms"               element={<LegalPage />} />
        <Route path="/security"            element={<LegalPage />} />
        <Route path="/support"             element={<LegalPage />} />

        {/* Auth */}
        <Route path="/login"               element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/signup"              element={<GuestRoute><SignupPage /></GuestRoute>} />
        <Route path="/forgot-password"     element={<ForgotPasswordPage />} />
        <Route path="/accept-invite"       element={<AcceptInvite />} />
        <Route path="/onboarding"          element={<PrivateRoute><OnboardingPage /></PrivateRoute>} />

        {/* Dashboard */}
        <Route path="/dashboard" element={<DashboardGuard><DashboardLayout /></DashboardGuard>}>
          <Route index             element={<DashboardPage />} />
          <Route path="generate"   element={<GeneratePage />} />
          <Route path="calendar"   element={<CalendarPage />} />
          <Route path="templates"  element={<TemplatesPage />} />
          <Route path="brand-kit"  element={<BrandKitPage />} />
          <Route path="settings"   element={<SettingsPage />} />
          <Route path="billing"    element={<BillingPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
