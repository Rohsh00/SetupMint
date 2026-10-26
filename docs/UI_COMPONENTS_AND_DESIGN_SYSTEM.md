# SetupMint — UI Components & Design System Specification

This document details the design system, component hierarchy, theme tokens, layout structures, and accessibility conventions implemented in the **SetupMint** frontend application ([`apps/web/src/`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/)).

---

## 1. Design System Principles & Theme Architecture

SetupMint implements a modern, precision-engineered trading terminal aesthetic built with **Material UI (MUI v9)**, **Emotion**, and **Tailwind CSS v3**:

- **Dark Mode First:** Default mode is a sleek dark terminal palette tailored for prolonged market monitoring.
- **Brand Palette:** Precision Mint/Emerald green accents symbolizing discipline, profitability, and clarity:
  - Mint Primary: `#10B981` (Emerald 500)
  - Mint Bright: `#34D399` (Emerald 400)
  - Mint Dark: `#059669` (Emerald 600)
- **Neutral Surfaces:** Deep slate/navy foundations (`#0F172A`, `#020617`, `#1E293B`) ensuring high-contrast readability without harsh glare.
- **Semantic Colors:**
  - Profit / Win: `#10B981` (Green)
  - Loss: `#F43F5E` / `#EF4444` (Rose / Red)
  - Breakeven / Neutral: `#64748B` (Slate)
  - Warning: `#F59E0B` (Amber)
  - Info: `#3B82F6` (Blue)
- **Typography:** Modern sans-serif stack (`Inter`, system-ui) paired with monospace typography (`JetBrains Mono`, monospace) for financial figures, lot sizes, and currency numbers.

---

## 2. Layout & Navigation Hierarchy

The application layout is encapsulated in [`apps/web/src/components/layout/AppLayout.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/layout/AppLayout.tsx):

```mermaid
graph TD
    AppLayout["AppLayout Container"]
    AppLayout --> Sidebar["Collapsible Navigation Sidebar (Drawer)"]
    AppLayout --> Header["Top Application Bar (AppBar)"]
    AppLayout --> MainContent["Page Viewport (<Outlet />)"]

    Sidebar --> Logo["SetupMintLogo (Collapsible)"]
    Sidebar --> NavLinks["Navigation Links (Overview, Trades, Journal, etc.)"]
    Sidebar --> CollapseToggle["Expand/Collapse Drawer Toggle"]

    Header --> MobileMenu["Mobile Hamburger Toggle"]
    Header --> GlobalAccount["Global Trading Account Switcher Dropdown"]
    Header --> QuickTradeBtn["'+ New Trade' Primary Action Button"]
    Header --> ThemeToggle["Dark / Light Mode Toggle Button"]
    Header --> UserMenu["User Profile Avatar & Logout Menu"]
```

### Navigation Items:
1. `/` — Overview (Dashboard)
2. `/trades` — Trades Ledger
3. `/journal` — Journal Calendar
4. `/analytics` — Analytics & Psychology
5. `/strategies` — Strategy Playbook
6. `/risk-calculator` — Risk Calculator
7. `/accounts` — Accounts Ledger
8. `/instruments` — Instruments Catalog
9. `/reports` — Reports & Data Portability
10. `/settings` — Settings & Configuration

---

## 3. Reusable UI Primitives

### 1. `SetupMintLogo.tsx` ([`apps/web/src/components/brand/SetupMintLogo.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/brand/SetupMintLogo.tsx))
- Renders vector geometric brand icon (ascending trend chevron, central candlestick wick, and diamond foundation).
- Supports three sizes: `sm`, `md`, `lg`.
- Configurable `collapsed` mode for compact sidebar drawer state.
- Includes `"PRO"` badge and tagline `"Trade. Track. Improve."`.

### 2. `ConfirmDialog.tsx` ([`apps/web/src/components/ui/ConfirmDialog.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/ui/ConfirmDialog.tsx))
- Accessible modal dialog for destructive actions (deleting trades, wiping accounts, resetting demo data).
- Renders custom warning icon, explanatory text, cancel button, and danger-themed confirmation button with loading spinner.

### 3. `QuickCloseTradeDialog.tsx` ([`apps/web/src/components/trades/QuickCloseTradeDialog.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/QuickCloseTradeDialog.tsx))
- Compact modal dialog for rapid closure of `OPEN` and `PLANNED` trades directly from `/trades` or `/trades/:id`.
- Prompts for exit price, exit date/time (defaults to current local time), and optional exit fees.
- Real-time statutory fee calculation via `@tradevault/financial-engine` with manual override and reset.
- Live Net Realized P&L preview banner before closing the position.

### 4. `CommandPalette.tsx` ([`apps/web/src/components/layout/CommandPalette.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/layout/CommandPalette.tsx))
- Global `Cmd+K` / `Ctrl+K` command search modal with full keyboard navigation (`↑`/`↓`/`↵`/`Esc`).
- Provides quick actions: Log New Trade (`N`), Repeat Last Trade (`R`), Jump to Today's Journal (`J`), Open Risk Calculator (`C`), and instant fuzzy page navigation.

### 5. `Modal.tsx` ([`apps/web/src/components/ui/Modal.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/ui/Modal.tsx))
- Base modal wrapper with smooth backdrop transition, keyboard `Esc` listener, and focus trapping.

### 6. `DateRangeFilter.tsx` ([`apps/web/src/components/ui/DateRangeFilter.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/ui/DateRangeFilter.tsx))
- Universal date range selector button and popover supporting 14 financial presets plus custom start/end dates.
- See **Section 9** for full architectural and visual specification.

---

## 4. Trade Entry & Form Architecture

The central trade logging experience is managed by [`TradeFormModal.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/TradeFormModal.tsx), composed of specialized sub-components:

| Component | Responsibility |
| :--- | :--- |
| `TradeCalculationBanner` | Displays live real-time gross P&L, statutory fee breakdown, AUTO/MANUAL fee chip with reset action, net P&L, realized R-multiple, and strategy minimum R:R violation warning before form submission. |
| `TradeTemplateSelector` | One-click prefill chips for common market setups (e.g., Nifty Breakout, BankNifty Mean Reversion). |
| `TradeQuickSection` | Express trade entry with instrument autofill (currency, multiplier, lot size), bidirectional **Lots** / Quantity conversion, auto-session derivation, strategy playbook selection with auto-confluences prefill, and auto statutory fee breakdown with manual override and reset. |
| `TradeAdvancedFills` | Interactive chronological list of entry and exit fills with FIFO lot matching. |
| `TradeJournalDetails` | Accordion containing deep-dive tabs: Identity, Execution, Risk, Technical Thesis, and Psychology. |
| `TradeAttachmentUploader` | Multi-file drag-and-drop and direct clipboard paste (`Ctrl+V` / `Cmd+V`) dropzone with staging preview, progress indicators, and category selection. |

---

## 5. Notification System (`ToastContext.tsx`)

Implemented in [`apps/web/src/context/ToastContext.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/context/ToastContext.tsx):
- Provides programmatic notification dispatch: `toast.success()`, `toast.error()`, `toast.info()`, `toast.warning()`.
- Floating notification stack fixed at the top-right of the viewport (`z-index: 9999`).
- Features progress bar countdown, manual dismiss button, and automatic timeout (default: 4,000ms).
- Smooth spring animations for enter and exit transitions.

---

## 6. Skeletons, Empty States & Loading Indicators

1. **Dashboard Skeleton:** Renders placeholder KPI card boxes and chart containers during initial data load.
2. **Table Empty States:** Master tables display descriptive empty states with illustrated icons and clear Call-to-Action (CTA) buttons (e.g., `"No trades recorded yet. Click 'Log New Trade' to begin."`).
3. **Button Loading States:** All submission buttons disable during network transit and render spinning `CircularProgress` indicators.

---

## 7. Responsive Behavior & Breakpoints

- **Desktop ($\ge 1200\text{px}$):** Full 250px persistent sidebar drawer; dual-column dashboard layout.
- **Tablet ($900\text{px} - 1199\text{px}$):** Collapsed 72px icon-only sidebar drawer.
- **Mobile ($< 900\text{px}$):** Drawer converts to temporary off-canvas sliding drawer toggled via header hamburger button. Grid layouts collapse to single-column vertical stacks.

---

## 8. Multi-Panel Performance & Universal Drilldown Components

### 1. `MultiPanelEquityCurve.tsx` ([`apps/web/src/components/dashboard/MultiPanelEquityCurve.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/dashboard/MultiPanelEquityCurve.tsx))
- **Role:** High-density, multi-panel performance visualization with synchronized Recharts time axes.
- **Features:**
  - Synchronized dual-panel charts via `syncId="setupmint-equity-sync"`.
  - **Upper Panel:** Money equity curve, cumulative-R curve, or synchronized dual-axis Both view. Includes up to 6 per-strategy overlays with `< 30 trades` sample-size warning badges. Overlays forward Monte Carlo expectancy cones (P5, P25, P50, P75, P95). Emits clickable event markers for Daily Loss Breaches (crimson) and High-Tilt Days (amber).
  - **Lower Panel:** Synchronized Underwater / Drawdown area graph with continuous drawdown depth, peak-to-trough max drawdown, and recovery duration indicators in calendar days and trade count.
  - **Interactive Drilldown:** Every curve point and event marker is clickable, invoking `openDrill()` with relevant trade IDs or filters.

### 2. `TradeDrillDrawer.tsx` ([`apps/web/src/components/drilldown/TradeDrillDrawer.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/drilldown/TradeDrillDrawer.tsx))
- **Role:** Universal right-hand drawer / bottom sheet for immediate trade inspection anywhere across the application.
- **Layout & Responsiveness:**
  - 620px width on desktop ($\ge 900\text{px}$); full-width bottom sheet on mobile ($< 900\text{px}$).
  - Mounted once in [`AppLayout.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/layout/AppLayout.tsx) to guarantee zero layout shifts and instant availability.
- **Modes:**
  - **Single Trade View:** Comprehensive trade header, P&L badge, R-multiple badge, execution fills, key confluences, discipline rating, mistake chips, screenshot previews, and direct navigation buttons (`"Open in Full Detail"`, `"Edit Trade"`).
  - **Multi-Trade List View:** Summary aggregate ribbon (`Total Trades`, `Net P&L`, `Win Rate %`, `Sum R`), sortable columns, outcome chips, and row click selection with smooth drill into single trade mode.
- **Keyboard Shortcuts:**
  - `j`: Move to next trade in list.
  - `k`: Move to previous trade in list.
  - `Esc`: Close drawer.

### 3. `TradeDrillContext.tsx` ([`apps/web/src/context/TradeDrillContext.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/context/TradeDrillContext.tsx))
- **Role:** React context provider wrapping the application tree in [`App.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/App.tsx).
- **Capabilities:**
  - Exposes `openDrill(descriptor)` and `closeDrill()`.
  - Automatically synchronizes active drill descriptor with the browser URL (`?drill=<base64-json>`), enabling browser history back/forward navigation and shareable deep links.
  - 150ms debounced prefetching cache to ensure instant drawer opening upon click.

---

## 9. Global Date Range Filter Architecture (`DateRangeFilter.tsx` & `DateRangeContext.tsx`)

### 1. `DateRangeFilter.tsx` ([`apps/web/src/components/ui/DateRangeFilter.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/ui/DateRangeFilter.tsx))
- **Role:** Reusable, theme-aware date range picker component built with MUI v9 `Popover` and Tailwind CSS.
- **Visual Design & Aesthetics:**
  - **Trigger Button:** Polished terminal pill button showing a calendar icon (`CalendarTodayRounded`), the currently active preset badge (e.g. `THIS_FY`), and a formatted human-readable date span (e.g. `01 Apr 2026 – 26 Oct 2026`). Features subtle border glow (`focus:ring-1 focus:ring-emerald-500/50`) and chevron dropdown indicator.
  - **Popover Overlay:** 360px structured overlay with backdrop blur, deep slate background (`#0F172A` / `#020617`), and emerald border accent.
  - **Categorized Presets:** Presets are categorized into semantic groups:
    - *Quick:* `TODAY`, `YESTERDAY`, `7D`, `30D`, `90D`
    - *Calendar Periods:* `THIS_WEEK`, `LAST_WEEK`, `THIS_MONTH`, `LAST_MONTH`, `THIS_QUARTER`, `YTD`, `ALL_TIME`
    - *Fiscal Year:* `THIS_FY`, `LAST_FY` (Indian FY: April 1 to March 31, clipped to today for active FY)
  - **Custom Range Controls:**
    - Dual HTML5 date inputs (`Start Date`, `End Date`) with calendar picker icon and automatic max date clamping (`max={todayStr}`).
    - Dynamic inline validation alerts with warning icons for:
      - Start date after end date (`"Start date cannot be after end date"`).
      - Invalid calendar dates (`"Invalid start/end date format (YYYY-MM-DD)"`).
    - Disabled `"Apply Range"` button when invalid inputs exist, preventing bad network requests.
    - Quick `"Reset to All Time"` button to restore baseline view with single click.
- **Responsiveness & Mobile Ergonomics:**
  - Supports `fullWidth` prop for stacked layouts and mobile viewports (`< 900px`).
  - Native date picker interfaces trigger seamless mobile OS date wheels on touch devices.

### 2. `DateRangeContext.tsx` ([`apps/web/src/context/DateRangeContext.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/context/DateRangeContext.tsx))
- **Role:** Monorepo-wide temporal state orchestrator wrapping the root component tree.
- **State Interface:**
  ```typescript
  interface DateRangeContextValue {
    preset: DateRangePreset;
    startDate?: string; // YYYY-MM-DD
    endDate?: string;   // YYYY-MM-DD
    formattedRange: string;
    setPreset: (preset: DateRangePreset) => void;
    setCustomRange: (startDate?: string, endDate?: string) => void;
    resetToDefault: () => void;
  }
  ```
- **URL Parameter Synchronization:**
  - Synchronizes filter state with URL search parameters (`?from=YYYY-MM-DD&to=YYYY-MM-DD&range=PRESET`), matching the deep-linking model of `TradeDrillContext`.
  - Enables browser back/forward history navigation and shareable link reproduction.
  - No `localStorage` pollution for active ranges; preserves clean URL truth.
- **Query Key Integration:**
  - Changing the date range updates `startDate` and `endDate`, which are incorporated into TanStack Query keys across all consumption views (Dashboard, Trades, Analytics, Strategies, Reports, Instruments), triggering clean surgical refetches without invalidating unrelated caches.


