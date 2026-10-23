import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.js';
import { AppLayout } from './components/layout/AppLayout.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { TradesPage } from './pages/TradesPage.js';
import { TradeDetailPage } from './pages/TradeDetailPage.js';
import { JournalCalendarPage } from './pages/JournalCalendarPage.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { StrategyPlaybookPage } from './pages/StrategyPlaybookPage.js';
import { StrategyVariantAnalyticsPage } from './pages/StrategyVariantAnalyticsPage.js';
import { RiskCalculatorPage } from './pages/RiskCalculatorPage.js';
import { AccountsPage } from './pages/AccountsPage.js';
import { InstrumentsPage } from './pages/InstrumentsPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';

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
    </BrowserRouter>
  );
}
export default App;
