import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/layout/AppShell";
import { OrgGate } from "./components/layout/OrgGate";
import { OwnerRoute } from "./components/layout/OwnerRoute";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { DashboardPage } from "./pages/DashboardPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { LaborPage } from "./pages/LaborPage";
import { MenuAnalysisPage } from "./pages/MenuAnalysisPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PriceHistoryPage } from "./pages/PriceHistoryPage";
import { RecipesPage } from "./pages/RecipesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SalesPage } from "./pages/SalesPage";
import { BillingPage } from "./pages/settings/BillingPage";
import { IntegrationsPage } from "./pages/settings/IntegrationsPage";
import { OrganizationPage } from "./pages/settings/OrganizationPage";
import { ProfilePage } from "./pages/settings/ProfilePage";
import { SettingsLayout } from "./pages/settings/SettingsLayout";
import { TeamPage } from "./pages/settings/TeamPage";
import { SignInPage } from "./pages/SignInPage";
import { SignUpPage } from "./pages/SignUpPage";
import { TheoreticalsPage } from "./pages/TheoreticalsPage";

function App() {
  return (
    <Routes>
      <Route path="sign-in" element={<SignInPage />} />
      <Route path="sign-up" element={<SignUpPage />} />
      <Route path="forgot-password" element={<ForgotPasswordPage />} />
      <Route path="reset-password" element={<ResetPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="onboarding" element={<OnboardingPage />} />

        <Route element={<OrgGate />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="recipes" element={<RecipesPage />} />
            <Route path="sales" element={<SalesPage />} />
            <Route path="menu-analysis" element={<MenuAnalysisPage />} />
            <Route path="theoreticals" element={<TheoreticalsPage />} />
            <Route path="labor" element={<LaborPage />} />
            <Route path="price-history" element={<PriceHistoryPage />} />
            <Route path="reports" element={<ReportsPage />} />

            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="profile" replace />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route element={<OwnerRoute />}>
                <Route path="team" element={<TeamPage />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="organization" element={<OrganizationPage />} />
                <Route path="integrations" element={<IntegrationsPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}

export default App;