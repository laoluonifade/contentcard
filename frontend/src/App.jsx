import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/ui/Toast'
import useAuthStore from './stores/authStore'

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
import PitchDeckPage        from './pages/PitchDeckPage'
import ProductGuidePage     from './pages/ProductGuidePage'
import DashboardLayout      from './components/layout/DashboardLayout'
import DashboardPage        from './pages/DashboardPage'
import CalendarPage         from './pages/CalendarPage'
import BrandKitPage         from './pages/BrandKitPage'
import TemplatesPage        from './pages/TemplatesPage'
import SettingsPage         from './pages/SettingsPage'
import BillingPage          from './pages/BillingPage'
import DirectoryPage        from './pages/DirectoryPage'

// Admin
import AdminLogin           from './pages/AdminLogin'
import AdminDashPage        from './pages/AdminDashPage'
import AdminUsersPage       from './pages/AdminUsersPage'
import AdminWorkspacesPage  from './pages/AdminWorkspacesPage'
import AdminBrandsPage      from './pages/AdminBrandsPage'
import AdminContentPage     from './pages/AdminContentPage'
import AdminBillingPage     from './pages/AdminBillingPage'
import AdminAnalyticsPage   from './pages/AdminAnalyticsPage'
import AdminTrendsPage      from './pages/AdminTrendsPage'
import AdminTemplatesPage   from './pages/AdminTemplatesPage'
import AdminSettingsPage    from './pages/AdminSettingsPage'

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function GuestRoute({ children }) {
  const { isAuthenticated } = useAuthStore()
  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />
}

function AdminRoute({ children }) {
  const admin = localStorage.getItem('contentcard-admin')
  return admin ? children : <Navigate to="/admindash/login" replace />
}

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
        <Route path="/contact"               element={<ContactPage />} />
        <Route path="/blog"                  element={<BlogPage />} />
        <Route path="/careers"               element={<CareersPage />} />
        <Route path="/changelog"             element={<ChangelogPage />} />
        <Route path="/roadmap"               element={<RoadmapPage />} />
        <Route path="/privacy"               element={<LegalPage />} />
        <Route path="/terms"                 element={<LegalPage />} />
        <Route path="/security"              element={<LegalPage />} />
        <Route path="/support"               element={<LegalPage />} />
        <Route path="/pitch-deck"            element={<PitchDeckPage />} />
        <Route path="/product-guide"         element={<ProductGuidePage />} />

        {/* Auth */}
        <Route path="/login"                 element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/signup"                element={<GuestRoute><SignupPage /></GuestRoute>} />
        <Route path="/forgot-password"       element={<ForgotPasswordPage />} />
        <Route path="/accept-invite"         element={<AcceptInvite />} />
        <Route path="/onboarding"            element={<PrivateRoute><OnboardingPage /></PrivateRoute>} />

        {/* Dashboard */}
        <Route path="/dashboard" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}>
          <Route index             element={<DashboardPage />} />
          <Route path="calendar"   element={<CalendarPage />} />
          <Route path="templates"  element={<TemplatesPage />} />
          <Route path="brand-kit"  element={<BrandKitPage />} />
          <Route path="settings"   element={<SettingsPage />} />
          <Route path="billing"    element={<BillingPage />} />
          <Route path="directory"  element={<DirectoryPage />} />
        </Route>

        {/* Admin */}
        <Route path="/admindash/login"       element={<AdminLogin />} />
        <Route path="/admindash"             element={<AdminRoute><AdminDashPage /></AdminRoute>} />
        <Route path="/admindash/users"       element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
        <Route path="/admindash/workspaces"  element={<AdminRoute><AdminWorkspacesPage /></AdminRoute>} />
        <Route path="/admindash/brands"      element={<AdminRoute><AdminBrandsPage /></AdminRoute>} />
        <Route path="/admindash/content"     element={<AdminRoute><AdminContentPage /></AdminRoute>} />
        <Route path="/admindash/billing"     element={<AdminRoute><AdminBillingPage /></AdminRoute>} />
        <Route path="/admindash/analytics"   element={<AdminRoute><AdminAnalyticsPage /></AdminRoute>} />
        <Route path="/admindash/trends"      element={<AdminRoute><AdminTrendsPage /></AdminRoute>} />
        <Route path="/admindash/templates"   element={<AdminRoute><AdminTemplatesPage /></AdminRoute>} />
        <Route path="/admindash/settings"    element={<AdminRoute><AdminSettingsPage /></AdminRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
