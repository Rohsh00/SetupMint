# SetupMint — Future FYERS Broker Integration Architecture

## 1. Architectural Strategy
To ensure complete local privacy and independence from broker API volatility, live broker synchronization is **isolated and disabled** in the first release.

The application has been engineered with clean abstractions so that future FYERS connectivity can be enabled without refactoring the core trading model, database schema, or UI components.

---

## 2. Decoupled Abstractions

### A. Broker Adapter Interface
```typescript
export interface IBrokerAdapter {
  brokerName: 'FYERS';
  authenticate(authCode: string): Promise<{ accessToken: string; expiresAt: Date }>;
  fetchOrderHistory(startDate: Date, endDate: Date): Promise<INormalizedOrder[]>;
  fetchTradeExecutions(startDate: Date, endDate: Date): Promise<INormalizedExecution[]>;
  fetchPositions(): Promise<INormalizedPosition[]>;
}
```

### B. Normalized Execution Schema
An order is **not** equivalent to an executed trade. Multiple fills can occur for a single order, or orders may be cancelled. The broker synchronization maps raw broker payloads into `INormalizedExecution`:

```typescript
export interface INormalizedExecution {
  broker: 'FYERS';
  brokerTradeId: string;
  brokerOrderId: string;
  symbol: string;
  exchange: string;
  segment: string;
  direction: 'LONG' | 'SHORT';
  price: number;
  quantity: number;
  timestamp: string;
  orderType: string;
  productType: string;
  rawPayload?: Record<string, any>;
}
```

---

## 3. Reconciliation Workflow
When automated synchronization is enabled in future releases:
1. **Idempotency Key Check**: Checks `externalExecutionId` and `externalBrokerOrderRef` to prevent importing the same fill twice.
2. **Ambiguity Resolution**: If a manually logged trade on the same date has matching symbol and quantity, the reconciler flags it as `AMBIGUOUS_MATCH` rather than silently creating duplicate records.
3. **Manual Review Screen**: The user reviews pending broker imports, confirms fills, and merges them into journal entries while preserving existing notes and psychological tags.
4. **Credential Isolation**: Broker tokens and app secrets are stored exclusively in the `BrokerIntegration` collection and never embedded in trade records or client bundles.
