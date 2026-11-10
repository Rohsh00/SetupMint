import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.js';
import { AppLayout } from './components/layout/AppLayout.js';
import { TradeDrillProvider } from './context/TradeDrillContext.js';
import { DateRangeProvider } from './context/DateRangeContext.js';
import { AccountScopeProvider } from './context/AccountScopeContext.js';

const DashboardPage = React.lazy(() => import('./pages/DashboardPage.js').then(m => ({ default: m.DashboardPage })));
const TradesPage = React.lazy(() => import('./pages/TradesPage.js').then(m => ({ default: m.TradesPage })));
const TradeDetailPage = React.lazy(() => import('./pages/TradeDetailPage.js').then(m => ({ default: m.TradeDetailPage })));
const JournalCalendarPage = React.lazy(() => import('./pages/JournalCalendarPage.js').then(m => ({ default: m.JournalCalendarPage })));
const WeeklyReviewPage = React.lazy(() => import('./pages/WeeklyReviewPage.js').then(m => ({ default: m.WeeklyReviewPage })));
const AnalyticsPage = React.lazy(() => import('./pages/AnalyticsPage.js').then(m => ({ default: m.AnalyticsPage })));
const StrategyPlaybookPage = React.lazy(() => import('./pages/StrategyPlaybookPage.js').then(m => ({ default: m.StrategyPlaybookPage })));
const StrategyVariantAnalyticsPage = React.lazy(() => import('./pages/StrategyVariantAnalyticsPage.js').then(m => ({ default: m.StrategyVariantAnalyticsPage })));
const RiskCalculatorPage = React.lazy(() => import('./pages/RiskCalculatorPage.js').then(m => ({ default: m.RiskCalculatorPage })));
const AccountsPage = React.lazy(() => import('./pages/AccountsPage.js').then(m => ({ default: m.AccountsPage })));
const InstrumentsPage = React.lazy(() => import('./pages/InstrumentsPage.js').then(m => ({ default: m.InstrumentsPage })));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage.js').then(m => ({ default: m.ReportsPage })));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage.js').then(m => ({ default: m.SettingsPage })));
const LoginPage = React.lazy(() => import('./pages/LoginPage.js').then(m => ({ default: m.LoginPage })));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage.js').then(m => ({ default: m.RegisterPage })));

function PageLoader() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        <span className="text-xs text-muted-foreground font-mono">Loading SetupMint...</span>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <span className="text-xs text-muted-foreground font-mono">Authenticating SetupMint session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <AccountScopeProvider>
        <DateRangeProvider>
          <TradeDrillProvider>
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* Protected App Routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="trades" element={<TradesPage />} />
                <Route path="trades/:id" element={<TradeDetailPage />} />
                <Route path="journal" element={<JournalCalendarPage />} />
                <Route path="review/weekly" element={<WeeklyReviewPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="strategies" element={<StrategyPlaybookPage />} />
                <Route path="strategies/:id/analytics" element={<StrategyVariantAnalyticsPage />} />
                <Route path="risk-calculator" element={<RiskCalculatorPage />} />
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="instruments" element={<InstrumentsPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </TradeDrillProvider>
      </DateRangeProvider>
    </AccountScopeProvider>
  </BrowserRouter>
  );
}
export default App;
