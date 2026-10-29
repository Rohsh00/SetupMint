/**
 * SetupMint HTML5 Desktop Web Notifications Service
 * Dispatches background system notifications for FYERS auto-executions,
 * stop trailing, and risk alerts when the trader is in other browser tabs or apps.
 */

export const notificationService = {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  },

  getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  },

  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const perm = await Notification.requestPermission();
      return perm === 'granted';
    } catch {
      return false;
    }
  },

  sendNotification(title: string, options?: NotificationOptions): Notification | null {
    if (!this.isSupported()) return null;
    if (Notification.permission !== 'granted') return null;

    try {
      const notif = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        silent: true, // We use soundEngine for precise synthesized audio
        ...options,
      });

      // Auto-close after 7 seconds to keep notification tray tidy
      setTimeout(() => {
        try {
          notif.close();
        } catch {}
      }, 7000);

      notif.onclick = () => {
        window.focus();
        try {
          notif.close();
        } catch {}
      };

      return notif;
    } catch {
      return null;
    }
  },
};

