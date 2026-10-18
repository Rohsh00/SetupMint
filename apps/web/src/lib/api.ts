const BASE_URL = '/api/v1';

export class ApiError extends Error {
  code: string;
  details?: any;

  constructor(message: string, code = 'API_ERROR', details?: any) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // sends and receives HttpOnly session cookies
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success) {
    const error = data?.error || {};
    throw new ApiError(error.message || 'An error occurred with your request', error.code, error.details);
  }

  return data.data !== undefined ? data.data : (data as T);
}

export const api = {
  // Auth
  auth: {
    me: () => request<{ user: any }>('/auth/me'),
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
  },

  // Instruments
  instruments: {
    list: () => request<any[]>('/instruments'),
    create: (instrument: any) =>
      request<any>('/instruments', { method: 'POST', body: JSON.stringify(instrument) }),
    update: (id: string, updates: any) =>
      request<any>(`/instruments/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    delete: (id: string) => request(`/instruments/${id}`, { method: 'DELETE' }),
  },

  // Strategies
  strategies: {
    list: () => request<any[]>('/strategies'),
    get: (id: string) => request<any>(`/strategies/${id}`),
    create: (strategy: any) =>
      request<any>('/strategies', { method: 'POST', body: JSON.stringify(strategy) }),
    update: (id: string, updates: any) =>
      request<any>(`/strategies/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    delete: (id: string) => request(`/strategies/${id}`, { method: 'DELETE' }),
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
    bulkDelete: (tradeIds: string[]) =>
      request('/trades/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ tradeIds }),
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
    downloadUrl: (id: string) => `${BASE_URL}/attachments/${id}/download`,
    delete: (id: string) => request(`/attachments/${id}`, { method: 'DELETE' }),
  },

  // Export & Import
  exportImport: {
    csvUrl: (params: Record<string, any> = {}) => {
      const query = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val) query.set(key, String(val));
      }
      return `${BASE_URL}/export/csv?${query.toString()}`;
    },
    jsonUrl: (params: Record<string, any> = {}) => {
      const query = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val) query.set(key, String(val));
      }
      return `${BASE_URL}/export/json?${query.toString()}`;
    },
    previewCsv: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return request<any>('/export/import/preview', {
        method: 'POST',
        body: formData,
      });
    },
    commitImport: (payload: { accountId: string; rows: any[]; mapping: any }) =>
      request<any>('/export/import/commit', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  // Settings
  settings: {
    updateProfile: (profile: any) =>
      request<any>('/settings/profile', { method: 'PUT', body: JSON.stringify(profile) }),
    changePassword: (data: any) =>
      request('/settings/change-password', { method: 'POST', body: JSON.stringify(data) }),
    systemStatus: () => request<any>('/settings/system-status'),
  },

  // Integrations
  integrations: {
    fyersStatus: () => request<any>('/integrations/fyers/status'),
    fyersConfig: (config: any) =>
      request<any>('/integrations/fyers/config', { method: 'POST', body: JSON.stringify(config) }),
  },
};
