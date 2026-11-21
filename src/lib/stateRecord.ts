/**
 * Looks a nursing assistant credential up in Washington's public credential
 * data (data.wa.gov, published daily by the Department of Health). The state
 * offers this portal for software to use. Home care aide credentials are not
 * in it: state law limits those to an exact-match search on the Department's
 * own site, so they still need a person to check them.
 */
const SOURCE = 'https://data.wa.gov/resource/qxh8-f4bd.json';
export const STATE_SEARCH_PAGE = 'https://www.doh.wa.gov/pcs';

export interface StateRecord {
  number: string;
  firstName: string;
  lastName: string;
  type: string;
  status: string;
  /** yyyy-mm-dd, or '' when the state gives none. */
  expires: string;
  actionTaken: string;
}

export interface StateResult {
  /** How the records were found. */
  by: 'number' | 'name' | 'none';
  records: StateRecord[];
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

function isoDate(us: string | undefined): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(us ?? '');
  return m ? `${m[3]}-${m[1]}-${m[2]}` : '';
}

async function ask(where: string): Promise<StateRecord[]> {
  const url = `${SOURCE}?$limit=10&$order=${encodeURIComponent('expirationdate DESC')}&$where=${encodeURIComponent(where)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('The state credential data is not answering right now. Try again in a few minutes.');
  const rows = (await res.json()) as Record<string, string>[];
  return rows.map((r) => ({
    number: r.credentialnumber ?? '',
    firstName: r.firstname ?? '',
    lastName: r.lastname ?? '',
    type: r.credentialtype ?? '',
    status: r.status ?? '',
    expires: isoDate(r.expirationdate),
    actionTaken: r.actiontaken ?? '',
  }));
}

const NURSING_ASSISTANT = "starts_with(credentialtype, 'Nursing Assistant')";

/** True when the number looks like a home care aide credential (HM…), which the open data leaves out. */
export function looksLikeHomeCareAide(number: string | null): boolean {
  return /^\s*(HCA\W*)?HM/i.test(number ?? '');
}

export async function checkWithState(number: string | null, firstName: string, surname: string): Promise<StateResult> {
  // People write the same number many ways (NC60123456, NAC.NC.60123456, nc 6012 3456).
  // The state stores it as NAC.NC.<digits> for certified and NAR.NA.<digits> for registered.
  const digits = (number ?? '').replace(/\D/g, '');
  if (digits.length >= 6) {
    const forms = [`NAC.NC.${digits}`, `NAR.NA.${digits}`, `NCTP.TP.${digits}`, (number ?? '').trim().toUpperCase()];
    const found = await ask(`credentialnumber in (${forms.map(quote).join(', ')})`);
    if (found.length > 0) return { by: 'number', records: found };
  }
  const first = firstName.trim().split(/\s+/)[0] ?? '';
  const last = surname.trim();
  if (first && last) {
    const found = await ask(
      `${NURSING_ASSISTANT} AND upper(lastname) = ${quote(last.toUpperCase())} AND starts_with(upper(firstname), ${quote(first.toUpperCase())})`,
    );
    if (found.length > 0) return { by: 'name', records: found };
  }
  return { by: 'none', records: [] };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

export function sameSurname(record: StateRecord, surname: string): boolean {
  return norm(record.lastName) !== '' && norm(record.lastName) === norm(surname);
}

/** Active statuses that allow someone to work. */
export function isActive(record: StateRecord): boolean {
  return /^active/i.test(record.status);
}
