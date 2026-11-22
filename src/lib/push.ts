import { requireSupabase } from './supabase';

const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushSupport = 'supported' | 'needs-home-screen' | 'unsupported' | 'not-configured';

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function pushSupport(): PushSupport {
  if (!publicKey) return 'not-configured';
  // iOS only exposes Web Push to apps added to the Home Screen.
  if (isIos() && !isStandalone()) return 'needs-home-screen';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'supported';
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(undefined);
  return navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
}

function base64UrlToBytes(value: string) {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export async function currentPushSubscription() {
  if (pushSupport() !== 'supported') return null;
  const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function enablePush(userId: string) {
  if (!publicKey) throw new Error('Push notifications are not configured.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked. Allow them for Office Buddy in your phone settings and try again.');
  }
  await registerServiceWorker();
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
  const json = subscription.toJSON();
  const { error } = await requireSupabase().from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    user_agent: navigator.userAgent.slice(0, 300),
  }, { onConflict: 'endpoint' });
  if (error) throw error;
}

export async function disablePush() {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  const { error } = await requireSupabase().from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  if (error) throw error;
  await subscription.unsubscribe();
}
