import type {
  DrillDescriptor,
  IDrilldownResponse,
  IEquityCurvesResponse,
  ILiveWatcherSummary,
  ILiveOpenTradeMetric,
  IWeeklyReview,
  IWeeklyReviewSnapshot,
  IFocusRule,
  IFocusRuleEvaluation,
} from '@tradevault/shared';

export function getApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  if (envUrl) {
    return `${envUrl}/api/v1`;
  }
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname.endsWith('.onrender.com') || hostname.includes('setupmint')) {
      return 'https://setupmint-api.onrender.com/api/v1';
    }
  }
  return '/api/v1';
}

export const BASE_URL = getApiBaseUrl();

export class ApiError extends Error {
  code: string;
  status?: number;
  details?: any;

  constructor(message: string, code = 'API_ERROR', details?: any, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Dual auth token support: send Bearer token for cross-origin hosting resilience
  const token = typeof window !== 'undefined' ? localStorage.getItem('tv_token') : null;
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include', // sends and receives HttpOnly session cookies
    });
  } catch {
    throw new ApiError(
      'Network connection failed. Please check your internet connection or verify the server is running.',
      'NETWORK_ERROR',
      undefined,
      0
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success) {
    const error = data?.error || {};
    throw new ApiError(
      error.message || 'An error occurred with your request',
      error.code || `HTTP_${response.status}`,
      error.details,
      response.status
    );
  }

  if (data.pagination !== undefined && data.data !== undefined) {
    return { data: data.data, pagination: data.pagination } as T;
  }

  return data.data !== undefined ? data.data : (data as T);
}

export const api = {
  // Auth & Session Management
  auth: {
    me: () => request<{ user: any; token?: string }>('/auth/me'),
    login: (credentials: any) =>
      request<{ user: any; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    register: (details: any) =>
      request<{ user: any; token: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(details),
      }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    sessions: () =>
      request<
        Array<{
          id: string;
          createdAt: string;
          lastUsedAt: string;
          userAgent?: string;
          ipAddress?: string;
          isCurrent: boolean;
        }>
      >('/auth/sessions'),
    revokeSession: (id: string) =>
      request<{ success: boolean; message: string }>(`/auth/sessions/${id}`, {
        method: 'DELETE',
      }),
    logoutAll: (includeCurrent = false) =>
      request<{ success: boolean; message: string }>('/auth/logout-all', {
        method: 'POST',
        body: JSON.stringify({ includeCurrent }),
      }),
  },

  // Accounts
  accounts: {
    list: () => request<any[]>('/accounts'),
    get: (id: string) => request<any>(`/accounts/${id}`),
    create: (account: any) =>
      request<any>('/accounts', { method: 'POST', body: JSON.stringify(account) }),
    update: (id: string, updates: any) =>
      request<any>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    delete: (id: string) => request(`/accounts/${id}`, { method: 'DELETE' }),
    addTransaction: (id: string, tx: any) =>
      request(`/accounts/${id}/transactions`, { method: 'POST', body: JSON.stringify(tx) }),
    getTransactions: (id: string) => request<any[]>(`/accounts/${id}/transactions`),
    reconcile: (id: string) => request<any>(`/accounts/${id}/reconcile`, { method: 'POST' }),
    linkBroker: (id: string, clientId: string) =>
      request<any>(`/accounts/${id}/broker-link`, {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      }),
    unlinkBroker: (id: string) =>
      request<any>(`/accounts/${id}/broker-link`, { method: 'DELETE' }),
    syncFunds: (id: string) =>
      request<any>(`/accounts/${id}/sync-funds`, { method: 'POST' }),
    pendingTransactions: (id: string) =>
      request<{ transactions: any[]; latestSnapshot: any | null }>(
        `/accounts/${id}/pending-transactions`
      ),
    confirmTransaction: (accountId: string, txId: string) =>
      request<any>(`/accounts/${accountId}/transactions/${txId}/confirm`, {
        method: 'POST',
      }),
    rejectTransaction: (accountId: string, txId: string) =>
      request<any>(`/accounts/${accountId}/transactions/${txId}/reject`, {
        method: 'POST',
      }),
  },

  // Instruments
  instruments: {
    list: (params: Record<string, any> = {}) => {
      const query = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null && val !== '') {
          query.set(key, String(val));
        }
      }
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return request<any[]>(`/instruments${suffix}`);
    },
    create: (instrument: any) =>
      request<any>('/instruments', { method: 'POST', body: JSON.stringify(instrument) }),
    previewUpdate: (id: string, updates: any) =>
      request<any>(`/instruments/${id}/preview-update`, { method: 'POST', body: JSON.stringify(updates) }),
    update: (id: string, updates: any) =>
      request<any>(`/instruments/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    delete: (id: string) => request(`/instruments/${id}`, { method: 'DELETE' }),
  },

  // Strategies
  strategies: {
    list: (params: Record<string, any> = {}) => {
      const query = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null && val !== '') {
          query.set(key, String(val));
        }
      }
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return request<any[]>(`/strategies${suffix}`);
    },
    get: (id: string) => request<any>(`/strategies/${id}`),
    create: (strategy: any) =>
      request<any>('/strategies', { method: 'POST', body: JSON.stringify(strategy) }),
    update: (id: string, updates: any) =>
      request<any>(`/strategies/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    delete: (id: string) => request(`/strategies/${id}`, { method: 'DELETE' }),
    getAnalytics: (id: string, params: Record<string, any> = {}) => {
      const query = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null && val !== '') {
          query.set(key, String(val));
        }
      }
      return request<any>(`/strategies/${id}/analytics?${query.toString()}`);
    },
  },

  // Trade Setup Templates
  templates: {
    list: () => request<any[]>('/templates'),
    get: (id: string) => request<any>(`/templates/${id}`),
    create: (template: any) =>
      request<any>('/templates', { method: 'POST', body: JSON.stringify(template) }),
    update: (id: string, updates: any) =>
      request<any>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    delete: (id: string) => request(`/templates/${id}`, { method: 'DELETE' }),
    toggleFavorite: (id: string) => request<any>(`/templates/${id}/favorite`, { method: 'POST' }),
    useTemplate: (id: string) => request<any>(`/templates/${id}/use`, { method: 'POST' }),
  },

  // Trades
  trades: {
    list: (params: Record<string, any> = {}) => {
      const query = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null && val !== '') {
          query.set(key, String(val));
        }
      }
      return request<{ data: any[]; pagination: any }>(`/trades?${query.toString()}`);
    },
    get: (id: string) => request<any>(`/trades/${id}`),
    create: (trade: any) =>
      request<any>('/trades', { method: 'POST', body: JSON.stringify(trade) }),
    update: (id: string, trade: any) =>
      request<any>(`/trades/${id}`, { method: 'PUT', body: JSON.stringify(trade) }),
    delete: (id: string) => request(`/trades/${id}`, { method: 'DELETE' }),
    duplicate: (id: string) =>
      request<any>(`/trades/${id}/duplicate`, { method: 'POST' }),
    bulkTag: (tradeIds: string[], tagsToAdd: string[]) =>
      request('/trades/bulk-tag', {
        method: 'POST',
        body: JSON.stringify({ tradeIds, tagsToAdd }),
      }),
    bulkClassify: (payload: {
      tradeIds: string[];
      strategyId?: string;
      variantKey?: string;
      variantStatus?: string;
      setupAttributes?: any;
    }) =>
      request('/trades/bulk-classify', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    bulkDelete: (tradeIds: string[]) =>
      request('/trades/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ tradeIds }),
      }),
    getLiveWatcher: (accountId?: string) => {
      const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
      return request<ILiveWatcherSummary>(`/trades/live/watcher${query}`);
    },
    getLiveMetric: (id: string) =>
      request<ILiveOpenTradeMetric>(`/trades/${id}/live`),
    recordLivePulse: (id: string, emotion: string, notes?: string) =>
      request<any>(`/trades/${id}/live-pulse`, {
        method: 'POST',
        body: JSON.stringify({ emotion, notes }),
      }),
    computeExcursion: (id: string, options?: { provider?: 'AUTO' | 'ANGEL_ONE'; forceRefetch?: boolean }) =>
      request<any>(`/trades/${id}/excursion/compute`, {
        method: 'POST',
        body: JSON.stringify(options || {}),
      }),
    generateChart: (
      id: string,
      optionsOrForce?:
        | boolean
        | {
            force?: boolean;
            provider?: 'AUTO' | 'ANGEL_ONE';
            resolutions?: string[];
            paddingBefore?: number;
            paddingAfter?: number;
          },
      legacyProvider?: 'AUTO' | 'ANGEL_ONE'
    ) => {
      let body: Record<string, any> = {};
      if (typeof optionsOrForce === 'boolean') {
        body = { force: optionsOrForce, provider: legacyProvider };
      } else if (optionsOrForce) {
        body = optionsOrForce;
      }
      return request<any>(`/trades/${id}/chart/generate`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    detectStopMoves: (id: string, manualModifications?: any[]) =>
      request<any>(`/trades/${id}/stop-moves/detect`, {
        method: 'POST',
        body: JSON.stringify({ manualModifications }),
      }),
    getStopMoves: (id: string) =>
      request<any>(`/trades/${id}/stop-moves`),
    autoClassify: (id: string) =>
      request<any>(`/trades/${id}/auto-classify`, {
        method: 'POST',
      }),
    autoClassifyBatch: (tradeIds: string[]) =>
      request<any>('/trades/auto-classify-batch', {
        method: 'POST',
        body: JSON.stringify({ tradeIds }),
      }),
    getInteractiveCandles: (
      id: string,
      params?: {
        resolution?: string;
        from?: string | number;
        to?: string | number;
        preloadBefore?: number;
        preloadAfter?: number;
        force?: boolean;
      }
    ) => {
      const query = new URLSearchParams();
      if (params) {
        for (const [key, val] of Object.entries(params)) {
          if (val !== undefined && val !== null && val !== '') {
            query.set(key, String(val));
          }
        }
      }
      return request<{
        trade: any;
        candles: Array<{
          time: number;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        }>;
        resolution: string;
        provider: string;
        isUnderlyingFallback: boolean;
        symbol: string;
        firstTime: number | null;
        lastTime: number | null;
      }>(`/trades/${id}/interactive-candles?${query.toString()}`);
    },
    drilldown: (payload: { descriptor: DrillDescriptor; limit?: number }) =>
      request<IDrilldownResponse>('/trades/drilldown', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    liveBrokerSl: (
      id: string,
      payload: { stopPrice: number; executeBroker?: boolean; idempotencyKey?: string }
    ) =>
      request<{
        trade: any;
        brokerResult: {
          executedOnBroker: boolean;
          action?: string;
          orderId?: string;
          message?: string;
          details?: any;
        };
      }>(`/trades/${id}/broker-sl`, {
        method: 'POST',
        headers: payload.idempotencyKey ? { 'X-Idempotency-Key': payload.idempotencyKey } : undefined,
        body: JSON.stringify(payload),
      }),
    liveBrokerExit: (
      id: string,
      payload: {
        quantity: number;
        exitPrice?: number;
        isFullClose?: boolean;
        executeBroker?: boolean;
        idempotencyKey?: string;
      }
    ) =>
      request<{
        trade: any;
        brokerResult: {
          executedOnBroker: boolean;
          action?: string;
          orderId?: string;
          message?: string;
          details?: any;
        };
        slippagePoints?: number;
      }>(`/trades/${id}/broker-exit`, {
        method: 'POST',
        headers: payload.idempotencyKey ? { 'X-Idempotency-Key': payload.idempotencyKey } : undefined,
        body: JSON.stringify(payload),
      }),
    liveBrokerLadderStep: (
      id: string,
      payload: {
        targetIndex: number;
        label: string;
        exitQty: number;
        exitPrice?: number;
        newStopLoss?: number;
        executeBroker?: boolean;
        reason?: string;
        idempotencyKey?: string;
      }
    ) =>
      request<{
        trade: any;
        brokerExitResult: {
          executedOnBroker: boolean;
          action?: string;
          orderId?: string;
          message?: string;
        };
        brokerSlResult: {
          executedOnBroker: boolean;
          action?: string;
          orderId?: string;
          message?: string;
          warning?: boolean;
        };
        slippagePoints?: number;
      }>(`/trades/${id}/broker-ladder-step`, {
        method: 'POST',
        headers: payload.idempotencyKey ? { 'X-Idempotency-Key': payload.idempotencyKey } : undefined,
        body: JSON.stringify(payload),
      }),
  },

  // Dashboard
  dashboard: {
    stats: (params: Record<string, any> = {}) => {
      const query = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null && val !== '') {
          query.set(key, String(val));
        }
      }
      return request<any>(`/dashboard/stats?${query.toString()}`);
    },
    equityCurves: (params: Record<string, any> = {}) => {
      const query = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null && val !== '') {
          query.set(key, String(val));
        }
      }
      return request<IEquityCurvesResponse>(`/dashboard/equity-curves?${query.toString()}`);
    },
  },

  // Journal
  journal: {
    calendar: (yearMonth?: string) => {
      const query = yearMonth ? `?yearMonth=${yearMonth}` : '';
      return request<{ yearMonth: string; days: any[] }>(`/journal/calendar${query}`);
    },
    getDay: (date: string) => request<any>(`/journal/${date}`),
    saveDay: (date: string, review: any) =>
      request<any>(`/journal/${date}`, { method: 'POST', body: JSON.stringify(review) }),
    deleteDay: (date: string) =>
      request<any>(`/journal/${date}`, { method: 'DELETE' }),
  },

  // Analytics
  analytics: {
    psychology: (params: Record<string, any> = {}) => {
      const query = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val) query.set(key, String(val));
      }
      return request<any>(`/analytics/psychology?${query.toString()}`);
    },
    excursion: (params: Record<string, any> = {}) => {
      const query = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null && val !== '') query.set(key, String(val));
      }
      return request<any>(`/analytics/excursion?${query.toString()}`);
    },
    whatIf: (params: Record<string, any> = {}) => {
      return request<any>('/analytics/what-if', {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
  },

  // Risk Calculator
  risk: {
    calculate: (params: any) =>
      request<any>('/risk/calculate', { method: 'POST', body: JSON.stringify(params) }),
  },

  // Attachments
  attachments: {
    upload: (
      tradeId: string,
      file: File,
      meta?: { category?: string; caption?: string; timeframe?: string; chartTimestamp?: string }
    ) => {
      const formData = new FormData();
      formData.append('file', file);
      if (meta?.category) formData.append('category', meta.category);
      if (meta?.caption) formData.append('caption', meta.caption);
      if (meta?.timeframe) formData.append('timeframe', meta.timeframe);
      if (meta?.chartTimestamp) formData.append('chartTimestamp', meta.chartTimestamp);
      return request<any>(`/attachments/trades/${tradeId}/upload`, {
        method: 'POST',
        body: formData,
      });
    },
    listForTrade: (tradeId: string) => request<any[]>(`/attachments/trades/${tradeId}`),
    update: (id: string, updates: { category?: string; caption?: string; timeframe?: string }) =>
      request<any>(`/attachments/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    downloadUrl: (id: string) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tv_token') : null;
      const url = `${BASE_URL}/attachments/${id}/download`;
      return token ? `${url}?token=${encodeURIComponent(token)}` : url;
    },
    resolveAttachmentUrl: (
      attOrUrl?: string | { id?: string; _id?: string; downloadUrl?: string; url?: string } | null
    ): string => {
      if (!attOrUrl) return '';

      let rawUrl = '';
      if (typeof attOrUrl === 'string') {
        rawUrl = attOrUrl;
      } else {
        const id = attOrUrl.id || (attOrUrl as any)._id;
        rawUrl = attOrUrl.downloadUrl || attOrUrl.url || (id ? `${BASE_URL}/attachments/${id}/download` : '');
      }

      if (!rawUrl) return '';

      // Local staged blob: or data: URIs don't need token or API prefixing
      if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
        return rawUrl;
      }

      const token = typeof window !== 'undefined' ? localStorage.getItem('tv_token') : null;
      const tokenQuery = token ? `token=${encodeURIComponent(token)}` : '';

      // Normalize relative /api/v1 paths to the configured API BASE_URL
      let finalUrl = rawUrl;
      if (finalUrl.startsWith('/api/v1')) {
        finalUrl = `${BASE_URL}${finalUrl.slice('/api/v1'.length)}`;
      } else if (finalUrl.startsWith('/') && !finalUrl.startsWith('//')) {
        finalUrl = `${BASE_URL}${finalUrl}`;
      }

      // Append auth token query param for cross-origin media rendering (<img> tags do not send Authorization headers)
      if (tokenQuery && !finalUrl.includes('token=')) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + tokenQuery;
      }

      return finalUrl;
    },
    delete: (id: string) => request(`/attachments/${id}`, { method: 'DELETE' }),
  },

  // Export & Import
  exportImport: {
    csvUrl: (params: Record<string, any> = {}) => {
      const query = new URLSearchParams();
      const token = typeof window !== 'undefined' ? localStorage.getItem('tv_token') : null;
      if (token) query.set('token', token);
      for (const [key, val] of Object.entries(params)) {
        if (val) query.set(key, String(val));
      }
      return `${BASE_URL}/export/csv?${query.toString()}`;
    },
    jsonUrl: (params: Record<string, any> = {}) => {
      const query = new URLSearchParams();
      const token = typeof window !== 'undefined' ? localStorage.getItem('tv_token') : null;
      if (token) query.set('token', token);
      for (const [key, val] of Object.entries(params)) {
        if (val) query.set(key, String(val));
      }
      return `${BASE_URL}/export/json?${query.toString()}`;
    },
    previewCsv: (
      input: File | string,
      options: { importKind?: 'TRADES' | 'CASH_FLOWS'; accountId?: string; broker?: string } = {}
    ) => {
      const query = new URLSearchParams();
      if (options.importKind) query.set('importKind', options.importKind);
      if (options.accountId) query.set('accountId', options.accountId);
      if (options.broker) query.set('broker', options.broker);
      const suffix = query.toString() ? `?${query.toString()}` : '';

      if (typeof input === 'string') {
        return request<any>(`/export/import/preview${suffix}`, {
          method: 'POST',
          body: JSON.stringify({
            csvText: input,
            importKind: options.importKind,
            accountId: options.accountId,
            broker: options.broker,
          }),
        });
      }
      const formData = new FormData();
      formData.append('file', input);
      return request<any>(`/export/import/preview${suffix}`, {
        method: 'POST',
        body: formData,
      });
    },
    commitImport: (payload: {
      accountId: string;
      rows: any[];
      mapping: any;
      broker?: string;
      saveMapping?: boolean;
      importKind?: 'TRADES' | 'CASH_FLOWS';
    }) =>
      request<any>('/export/import/commit', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    undoImport: (batchId?: string) =>
      request<any>('/export/import/undo', {
        method: 'POST',
        body: JSON.stringify({ batchId }),
      }),
    getBatches: () => request<any>('/export/import/batches'),
    getMappings: () => request<any>('/export/mappings'),
    saveMapping: (data: { broker: string; name?: string; mapping: any }) =>
      request<any>('/export/mappings', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // Settings
  settings: {
    getProfile: () => request<any>('/settings/profile'),
    updateProfile: (profile: any) =>
      request<any>('/settings/profile', { method: 'PUT', body: JSON.stringify(profile) }),
    changePassword: (data: any) =>
      request('/settings/change-password', { method: 'POST', body: JSON.stringify(data) }),
    systemStatus: () => request<any>('/settings/system-status'),
    testTelegram: (data: { botToken?: string; chatId?: string }) =>
      request<any>('/settings/test-telegram', { method: 'POST', body: JSON.stringify(data) }),
    registerTelegramWebhook: (data: { botToken: string; webhookUrl: string }) =>
      request<any>('/settings/register-telegram-webhook', { method: 'POST', body: JSON.stringify(data) }),
    sampleTelegramAlert: () =>
      request<any>('/settings/sample-alert', { method: 'POST' }),
  },

  // Review Queue & Mistake Detection
  review: {
    queue: () => request<any>('/review/queue'),
    prefill: (date: string) => request<any>(`/review/prefill/${date}`),
    suggestMistakes: (tradeId: string) => request<any>(`/review/suggest-mistakes/${tradeId}`),
    getWeekly: (week?: string, accountId?: string) => {
      const params = new URLSearchParams();
      if (week) params.set('week', week);
      if (accountId) params.set('accountId', accountId);
      const qs = params.toString();
      return request<{
        review: IWeeklyReview | null;
        snapshot: IWeeklyReviewSnapshot;
        previousFocusRule: IFocusRule | null;
        previousFocusEvaluation: IFocusRuleEvaluation | null;
      }>(`/review/weekly${qs ? `?${qs}` : ''}`);
    },
    saveWeekly: (
      week: string,
      payload: {
        focusRule?: IFocusRule;
        notes?: string;
        status?: 'DRAFT' | 'FINALIZED';
        followedLastRule?: boolean | null;
      },
      accountId?: string
    ) => {
      const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
      return request<IWeeklyReview>(`/review/weekly/${week}${qs}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    listWeekly: (accountId?: string) => {
      const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
      return request<IWeeklyReview[]>(`/review/weekly${qs}`);
    },
  },

  // Integrations
  integrations: {
    fyersStatus: () => request<any>('/integrations/fyers/status'),
    fyersConfig: (config: any) =>
      request<any>('/integrations/fyers/config', { method: 'POST', body: JSON.stringify(config) }),
    fyersLoginUrl: () => request<any>('/integrations/fyers/login-url'),
    fyersSync: () => request<any>('/integrations/fyers/sync', { method: 'POST' }),
    fyersDisconnect: () => request<any>('/integrations/fyers/disconnect', { method: 'POST' }),
    fyersBackfillExcursion: (
      params: {
        startDate?: string;
        endDate?: string;
        limit?: number;
        provider?: 'AUTO' | 'ANGEL_ONE';
        forceRecompute?: boolean;
      } = {}
    ) =>
      request<any>('/integrations/fyers/excursion-backfill', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
  },

  // Market Data (Fallback Candle Feeds)
  marketData: {
    angelOne: {
      status: () => request<any>('/integrations/market-data/angel-one/status'),
      saveConfig: (data: { apiKey: string; clientCode: string; pin: string }) =>
        request<any>('/integrations/market-data/angel-one/config', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      connect: (totp: string) =>
        request<any>('/integrations/market-data/angel-one/connect', {
          method: 'POST',
          body: JSON.stringify({ totp }),
        }),
      disconnect: () =>
        request<any>('/integrations/market-data/angel-one/disconnect', { method: 'POST' }),
      deleteIntegration: () =>
        request<any>('/integrations/market-data/angel-one', { method: 'DELETE' }),
      refreshInstruments: (force?: boolean) =>
        request<any>('/integrations/market-data/angel-one/refresh-instruments', {
          method: 'POST',
          body: JSON.stringify({ force }),
        }),
    },
  },
};

