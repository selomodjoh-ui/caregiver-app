import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

/** True once both values from .env are present. */
export const isConfigured = Boolean(url && key);

/** The Supabase client, or null until the project is configured. */
export const supabase: SupabaseClient | null = isConfigured ? createClient(url!, key!) : null;

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
