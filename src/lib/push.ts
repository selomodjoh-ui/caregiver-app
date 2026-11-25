import { isNativeApp } from './native';
import { supabase } from './supabase';

/** What this phone or browser can do about notifications right now. */
export type PushState =
  | 'on' // this device is set up
  | 'off' // possible, not yet turned on
  | 'blocked' // the person said no in the browser; only they can undo it in settings
  | 'needs-install' // iPhone: works only after "Add to Home Screen"
  | 'unsupported';

const isIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function pushState(): Promise<PushState> {
  // The phone apps cannot use browser notifications; theirs arrive another way.
  if (isNativeApp()) return 'unsupported';
  if (!supported()) return isIphone() && !isInstalled() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/** Turns a base64url key into the bytes the browser wants. */
function keyBytes(key: string): Uint8Array {
  const pad = '='.repeat((4 - (key.length % 4)) % 4);
  const raw = atob((key + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const text = (buf: ArrayBuffer | null) =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';

/** Asks permission and registers this device. Returns a message to show if it did not work. */
export async function turnOnPush(): Promise<string | null> {
  if (!supabase) return 'The app is not connected yet.';
  if (!supported()) return 'This browser cannot show notifications.';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return 'Notifications are blocked for ShiftKind on this device. Allow them in your browser or phone settings, then try again.';
  }
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { data, error } = await supabase.functions.invoke('notify', { body: { action: 'key' } });
  const publicKey = (data as { publicKey?: string } | null)?.publicKey;
  if (error || !publicKey) return 'We could not set up notifications just now. Please try again in a moment.';
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }));
  const { error: saveError } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: text(sub.getKey('p256dh')),
    p_auth: text(sub.getKey('auth')),
  });
  if (saveError) return 'We could not save this device. Please try again.';
  return null;
}

/** Stops notifications on this device only. */
export async function turnOffPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/** Tells the other person about a message that was just sent. Never blocks the chat. */
export function announce(messageId: string): void {
  if (!supabase) return;
  supabase.functions.invoke('notify', { body: { message_id: messageId } }).catch(() => undefined);
}
