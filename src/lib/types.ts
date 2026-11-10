export type Part = 'day' | 'night';

export const PARTS: { part: Part; label: string }[] = [
  { part: 'day', label: 'Day' },
  { part: 'night', label: 'Night' },
];

/** day uses JavaScript's numbering: 0 = Sunday ... 6 = Saturday. Shown Monday first. */
export const DAYS: { day: number; short: string; full: string }[] = [
  { day: 1, short: 'Mon', full: 'Monday' },
  { day: 2, short: 'Tue', full: 'Tuesday' },
  { day: 3, short: 'Wed', full: 'Wednesday' },
  { day: 4, short: 'Thu', full: 'Thursday' },
  { day: 5, short: 'Fri', full: 'Friday' },
  { day: 6, short: 'Sat', full: 'Saturday' },
  { day: 0, short: 'Sun', full: 'Sunday' },
];

export const CREDENTIAL_LABELS: Record<string, string> = {
  hca_cna: 'HCA or CNA credential',
  tb_test: 'TB test',
  cpr_first_aid: 'CPR / First Aid',
  food_worker: 'Food worker card',
  nurse_delegation: 'Nurse delegation',
  dementia_mental_health: 'Dementia and mental health training',
  continuing_education: 'Continuing education',
};

/** The credentials a home can ask for when posting a shift. */
export const REQUIREMENT_KINDS = ['hca_cna', 'tb_test', 'cpr_first_aid', 'nurse_delegation'];

export interface HomeInfo {
  owner_id: string;
  name: string;
  license_number: string | null;
  address: string | null;
  phone: string | null;
  years_operating: number | null;
  bed_bound: number;
  assisted: number;
  independent: number;
  description: string | null;
  license_verified: boolean;
  plan: string;
  plan_until: string | null;
  requested_plan: string | null;
}

export interface Shift {
  id: string;
  home_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  pay_rate: number | null;
  requirements: string[];
  notes: string | null;
  status: 'open' | 'filled' | 'cancelled';
  /** Whether pay_rate is an hourly rate or a flat amount for the whole shift. */
  pay_type: 'hour' | 'shift';
  /** The home's own words on what the shift covers or the hours asked for. */
  pay_note: string | null;
  /** How many caregivers the shift needs. */
  spots: number;
  homes?: HomeInfo | null;
}

export type ApplicationStatus = 'applied' | 'offered' | 'accepted' | 'declined' | 'withdrawn';

export interface Application {
  id: string;
  shift_id: string;
  caregiver_id: string;
  status: ApplicationStatus;
}

export interface CaregiverCard {
  id: string;
  first_name: string;
  surname_initial: string;
}

export interface CredentialSummary {
  user_id: string;
  kind: string;
  status: 'in_review' | 'verified';
  expires_on: string | null;
}

/** One conversation: a caregiver and a home, about one shift. */
export interface Thread {
  /** The shift the conversation is about, or null for a direct conversation. */
  shiftId: string | null;
  /** The provider's id. Needed for direct conversations. */
  homeId?: string;
  caregiverId: string;
  title: string;
  subtitle: string;
}

function parseDate(dateText: string): Date {
  const [y, m, d] = dateText.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayText(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

export function daysAgoText(days: number): string {
  const then = new Date();
  then.setDate(then.getDate() - days);
  const m = String(then.getMonth() + 1).padStart(2, '0');
  const d = String(then.getDate()).padStart(2, '0');
  return `${then.getFullYear()}-${m}-${d}`;
}

export function formatDate(dateText: string): string {
  return parseDate(dateText).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function dayOf(dateText: string): number {
  return parseDate(dateText).getDay();
}

export function formatTime(timeText: string): string {
  const [h, m] = timeText.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, '0')}${suffix}`;
}

/** A shift that starts from 6am up to 6pm is a day shift; anything else is a night shift. */
export function partOf(timeText: string): Part {
  const h = Number(timeText.split(':')[0]);
  return h >= 6 && h < 18 ? 'day' : 'night';
}

export function shiftTitle(shift: Pick<Shift, 'shift_date' | 'start_time' | 'end_time'>): string {
  return `${formatDate(shift.shift_date)}, ${formatTime(shift.start_time)} to ${formatTime(shift.end_time)}`;
}

/** "$22.00/hr" or "$240.00 per shift", or nothing when no pay was given. */
export function payText(shift: Pick<Shift, 'pay_rate' | 'pay_type'>): string {
  if (shift.pay_rate == null) return '';
  const amount = `$${Number(shift.pay_rate).toFixed(2)}`;
  return shift.pay_type === 'shift' ? `${amount} per shift` : `${amount}/hr`;
}

/** Hours between two clock times. A shift that ends at or before its start runs past midnight. */
export function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes / 60;
}

/** What one caregiver earns for the shift: the flat amount, or hours times the hourly rate. */
export function payForShift(shift: Pick<Shift, 'pay_rate' | 'pay_type'>, hours: number): number | null {
  if (shift.pay_rate == null) return null;
  return shift.pay_type === 'shift' ? Number(shift.pay_rate) : hours * Number(shift.pay_rate);
}

export function careMix(home: Pick<HomeInfo, 'bed_bound' | 'assisted' | 'independent'>): string {
  const parts: string[] = [];
  if (home.bed_bound) parts.push(`${home.bed_bound} bed-bound`);
  if (home.assisted) parts.push(`${home.assisted} assisted`);
  if (home.independent) parts.push(`${home.independent} independent`);
  return parts.join(', ');
}

/** True while the home's package has not run out. No end date means no end. */
export function isHomeActive(home: Pick<HomeInfo, 'plan_until'>): boolean {
  return !home.plan_until || home.plan_until >= todayText();
}

/** True for a home on the Plus package, whose shifts are listed first. */
export function isFeatured(home: Pick<HomeInfo, 'plan' | 'plan_until'> | null | undefined): boolean {
  return !!home && home.plan === 'plus' && isHomeActive(home);
}

/** True when a credential is on file and not past its expiry date. */
export function isCurrent(c: { expires_on: string | null } | undefined): boolean {
  if (!c) return false;
  return !c.expires_on || c.expires_on >= todayText();
}
