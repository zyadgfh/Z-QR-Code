import { api } from './api';
import { useAuth } from '../stores/auth';

/** تحويل مفتاح VAPID من base64url إلى Uint8Array كما يتطلب PushManager */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushResult = 'ok' | 'denied' | 'unsupported';

/** تفعيل إشعارات المتصفح للوحة (NOTIF-01) — يطلب الإذن ويسجل الاشتراك للخادم */
export async function enablePush(): Promise<PushResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined')
    return 'unsupported';
  try {
    const { enabled, key } = await api<{ enabled: boolean; key: string | null }>('/api/shop/push/key');
    if (!enabled || !key) return 'unsupported';
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return 'denied';
    const reg = await navigator.serviceWorker.register('/sw-push.js');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
    });
    await api('/api/shop/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
    return 'ok';
  } catch {
    return 'unsupported';
  }
}

/** إيقاف الإشعارات وإزالة الاشتراك من الخادم */
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api('/api/shop/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch {
    /* لا شيء لإلغائه */
  }
}

export function vapidConfigured(): boolean {
  return !!useAuth.getState().token;
}
