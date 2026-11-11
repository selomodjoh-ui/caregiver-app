import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

/** True once both values from .env are present. */
export const isConfigured = Boolean(url && key);

/** The Supabase client, or null until the project is configured. */
export const supabase: SupabaseClient | null = isConfigured ? createClient(url!, key!) : null;

/** Gives up on a request that has not answered in time, so a screen never waits forever. */
export function withTimeout<T>(work: PromiseLike<T>, seconds = 20): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('The server took too long to answer. Check your connection and try again.')),
      seconds * 1000,
    );
    Promise.resolve(work).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        clearTimeout(timer);
        reject(reason);
      },
    );
  });
}

export const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type Role = 'caregiver' | 'provider';

export interface Profile {
  id: string;
  role: Role;
  first_name: string;
  surname: string;
  sex: string | null;
  phone: string | null;
  address: string | null;
}
