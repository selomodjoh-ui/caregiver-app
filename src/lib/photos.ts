import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Profile pictures. Each person has at most one, kept at avatars/<their id>/photo.jpg.
// Pictures are private to signed-in people, so they are fetched with the session
// and held in memory. Requests made in the same moment are grouped into one lookup.

const pathFor = (userId: string) => `${userId}/photo.jpg`;

/** userId -> picture address in this browser, or null when the person has no picture. */
const ready = new Map<string, string | null>();
const waiting = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

const tell = () => listeners.forEach((fn) => fn());

async function flush() {
  timer = null;
  const ids = [...waiting];
  waiting.clear();
  if (!supabase || ids.length === 0) return;
  const { data, error } = await supabase.from('profile_photos').select('user_id').in('user_id', ids);
  // If pictures are not set up yet, everyone simply shows their initial.
  const has = new Set(error ? [] : (data ?? []).map((r) => r.user_id as string));
  for (const id of ids) if (!has.has(id)) ready.set(id, null);
  tell();
  await Promise.all(
    [...has].map(async (id) => {
      const got = await supabase!.storage.from('avatars').download(pathFor(id));
      ready.set(id, got.data ? URL.createObjectURL(got.data) : null);
    }),
  );
  tell();
}

function ask(userId: string) {
  if (ready.has(userId) || waiting.has(userId)) return;
  waiting.add(userId);
  if (!timer) timer = setTimeout(flush, 30);
}

/** The picture for a person, or null while loading or when they have none. */
export function usePhoto(userId: string | null | undefined): string | null {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    if (userId) ask(userId);
    return () => {
      listeners.delete(fn);
    };
  }, [userId]);
  return userId ? (ready.get(userId) ?? null) : null;
}

/**
 * Shrinks a chosen picture to a 512px square JPEG, cut from the middle.
 * Redrawing it also drops anything hidden in the file, such as where it was taken.
 */
async function squareJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('unreadable'));
      img.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error('unreadable');
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('unreadable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 512);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 512, 512);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('unreadable');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Saves a new picture for the signed-in person. Returns a message to show if it did not work. */
export async function savePhoto(userId: string, file: File): Promise<string | null> {
  if (!supabase) return 'The app is not connected yet.';
  let blob: Blob;
  try {
    blob = await squareJpeg(file);
  } catch {
    return 'We could not read that picture. Try a JPG or PNG photo.';
  }
  const up = await supabase.storage
    .from('avatars')
    .upload(pathFor(userId), blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '0' });
  if (up.error) return 'We could not save the picture. Please try again.';
  const rec = await supabase.from('profile_photos').upsert({ user_id: userId, updated_at: new Date().toISOString() });
  if (rec.error) return 'We could not save the picture. Please try again.';
  ready.set(userId, URL.createObjectURL(blob));
  tell();
  return null;
}

/** Removes the signed-in person's picture. */
export async function removePhoto(userId: string): Promise<string | null> {
  if (!supabase) return 'The app is not connected yet.';
  const rec = await supabase.from('profile_photos').delete().eq('user_id', userId);
  if (rec.error) return 'We could not remove the picture. Please try again.';
  await supabase.storage.from('avatars').remove([pathFor(userId)]);
  ready.set(userId, null);
  tell();
  return null;
}
