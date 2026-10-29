/**
 * Off-Screen Push Alert Service via Telegram Bot API.
 * Dispatches real-time risk alerts directly to a trader's phone for:
 * - Stop loss critical / breached threat
 * - Profit giveback leaking / critical reversal
 * - Daily loss limit breach
 * - Naked positions without resting SL on exchange
 * - FYERS SEBI 24h token expiry warnings
 * - Ladder target hits when auto-execution is off
 */

export interface ITelegramAlertPayload {
  botToken: string;
  chatId: string;
  title: string;
  body: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';
  metrics?: Record<string, string | number>;
}

export class TelegramAlertService {
  private static TELEGRAM_API_BASE = 'https://api.telegram.org';
  private static recentAlerts = new Map<string, number>();
  private static DEBOUNCE_MS = 60 * 1000; // Debounce identical alerts per 60 seconds

  /**
   * Tests connection to Telegram bot and chat ID.
   */
  static async testConnection(botToken: string, chatId: string): Promise<{ success: boolean; message: string }> {
    try {
      const text = `🔔 <b>SetupMint Alert Link Verified</b>\n\nYour SetupMint trading journal is connected to this Telegram chat. You will receive critical risk warnings, giveback radar alerts, and token expiry notices off-screen.`;
      const res = await this.sendMessage(botToken, chatId, text);
      return { success: true, message: 'Test notification sent to Telegram successfully!' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to dispatch Telegram test message' };
    }
  }

  /**
   * Dispatches an alert with deduplication to avoid message flooding.
   */
  static async sendAlert(payload: ITelegramAlertPayload): Promise<boolean> {
    const { botToken, chatId, title, body, severity = 'WARNING', metrics } = payload;
    if (!botToken || !chatId) return false;

    const dedupeKey = `${chatId}:${title}:${body.slice(0, 30)}`;
    const now = Date.now();
    const lastSent = this.recentAlerts.get(dedupeKey);
    if (lastSent && now - lastSent < this.DEBOUNCE_MS) {
      return false; // Skip throttled duplicate alert
    }
    this.recentAlerts.set(dedupeKey, now);

    const icon =
      severity === 'CRITICAL'
        ? '🚨 <b>CRITICAL RISK ALERT</b>'
        : severity === 'WARNING'
        ? '⚠️ <b>WARNING ALERT</b>'
        : severity === 'SUCCESS'
        ? '🎯 <b>EXECUTION MILESTONE</b>'
        : 'ℹ️ <b>SETUPMINT NOTICE</b>';

    let message = `${icon}\n<b>${title}</b>\n\n${body}`;

    if (metrics && Object.keys(metrics).length > 0) {
      message += '\n\n<b>Details:</b>';
      for (const [k, v] of Object.entries(metrics)) {
        message += `\n• ${k}: <code>${v}</code>`;
      }
    }

    message += `\n\n<i>Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`;

    try {
      await this.sendMessage(botToken, chatId, message);
      return true;
    } catch (e: any) {
      console.warn(`[TelegramAlertService] Alert failed: ${e.message}`);
      return false;
    }
  }

  private static async sendMessage(botToken: string, chatId: string, text: string): Promise<any> {
    const url = `${this.TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const json = (await res.json()) as any;
    if (!json.ok) {
      throw new Error(json.description || 'Telegram API returned an error');
    }
    return json.result;
  }
}

