import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  daysAgoText,
  formatDate,
  formatTime,
  todayText,
  type Application,
  type CaregiverCard,
  type HomeInfo,
  type Shift,
} from '../../lib/types';

interface Props {
  userId: string;
  home: HomeInfo | null;
  onNeedHome: () => void;
}

interface Row {
  shift: Shift;
  caregiverId: string;
  name: string;
  hours: number;
  pay: number | null;
  stars: number | null;
}

/** Hours between two clock times. A shift that ends at or before its start runs past midnight. */
function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes / 60;
}

const money = (n: number) => `$${n.toFixed(2)}`;
const hoursText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function Reports({ userId, home, onNeedHome }: Props) {
  const [from, setFrom] = useState(daysAgoText(30));
  const [to, setTo] = useState(daysAgoText(-14));
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!supabase || !from || !to) return;
      setError('');
      const s = await supabase
        .from('shifts')
        .select('*')
        .eq('home_id', userId)
        .neq('status', 'cancelled')
        .gte('shift_date', from)
        .lte('shift_date', to)
        .order('shift_date')
        .order('start_time');
      if (s.error) setError(s.error.message);
      const shifts = (s.data ?? []) as Shift[];
      const ids = shifts.map((x) => x.id);
      if (ids.length === 0) {
        setRows([]);
        setLoaded(true);
        return;
      }
      const a = await supabase
        .from('applications')
        .select('id, shift_id, caregiver_id, status')
        .in('shift_id', ids)
        .eq('status', 'accepted');
      const apps = (a.data ?? []) as Application[];
      const people = [...new Set(apps.map((x) => x.caregiver_id))];
      const [c, r] = await Promise.all([
        people.length
          ? supabase.from('caregiver_cards').select('id, first_name, surname_initial').in('id', people)
          : Promise.resolve({ data: [] }),
        supabase.from('ratings').select('shift_id, ratee_id, stars').eq('rater_id', userId).in('shift_id', ids),
      ]);
      const cards = (c.data ?? []) as CaregiverCard[];
      const ratings = (r.data ?? []) as { shift_id: string; ratee_id: string; stars: number }[];

      setRows(
        apps
          .map((app) => {
            const shift = shifts.find((x) => x.id === app.shift_id)!;
            const card = cards.find((x) => x.id === app.caregiver_id);
            const hours = hoursBetween(shift.start_time, shift.end_time);
            return {
              shift,
              caregiverId: app.caregiver_id,
              name: card ? `${card.first_name} ${card.surname_initial}.` : 'Caregiver',
              hours,
              pay: shift.pay_rate != null ? hours * Number(shift.pay_rate) : null,
              stars:
                ratings.find((x) => x.shift_id === shift.id && x.ratee_id === app.caregiver_id)?.stars ?? null,
            };
          })
          .sort(
            (x, y) =>
              x.shift.shift_date.localeCompare(y.shift.shift_date) ||
              x.shift.start_time.localeCompare(y.shift.start_time),
          ),
      );
      setLoaded(true);
    }
    load();
  }, [userId, from, to]);

  if (!home) {
    return (
      <section className="section">
        <h2>Reports</h2>
        <p className="hint">Add your home details first. Reports appear once caregivers are on your shifts.</p>
        <button type="button" className="btn" onClick={onNeedHome}>
          Add home details
        </button>
      </section>
    );
  }

  const today = todayText();
  const upcoming = rows.filter((r) => r.shift.shift_date >= today);
  const worked = rows.filter((r) => r.shift.shift_date < today);

  const byPerson = [...new Set(rows.map((r) => r.caregiverId))]
    .map((id) => {
      const mine = rows.filter((r) => r.caregiverId === id);
      const rated = mine.filter((r) => r.stars != null);
      return {
        id,
        name: mine[0].name,
        shifts: mine.length,
        hours: mine.reduce((sum, r) => sum + r.hours, 0),
        pay: mine.some((r) => r.pay != null) ? mine.reduce((sum, r) => sum + (r.pay ?? 0), 0) : null,
        rating: rated.length ? rated.reduce((sum, r) => sum + (r.stars ?? 0), 0) / rated.length : null,
      };
    })
    .sort((x, y) => y.hours - x.hours);

  const totalHours = rows.reduce((sum, r) => sum + r.hours, 0);
  const totalPay = rows.reduce((sum, r) => sum + (r.pay ?? 0), 0);

  function downloadCsv() {
    const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      ['Date', 'Start', 'End', 'Caregiver', 'Hours', 'Pay per hour (USD)', 'Estimated pay (USD)', 'Your rating'],
      ...rows.map((r) => [
        r.shift.shift_date,
        r.shift.start_time.slice(0, 5),
        r.shift.end_time.slice(0, 5),
        r.name,
        hoursText(r.hours),
        r.shift.pay_rate != null ? Number(r.shift.pay_rate).toFixed(2) : '',
        r.pay != null ? r.pay.toFixed(2) : '',
        r.stars != null ? String(r.stars) : '',
      ]),
    ];
    const csv = lines.map((line) => line.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `caregiver-report-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function table(list: Row[]) {
    return (
      <div className="table-scroll">
        <table className="report-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Time</th>
              <th scope="col">Caregiver</th>
              <th scope="col">Hours</th>
              <th scope="col">Est. pay</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={`${r.shift.id}-${r.caregiverId}`}>
                <td>{formatDate(r.shift.shift_date)}</td>
                <td>
                  {formatTime(r.shift.start_time)} to {formatTime(r.shift.end_time)}
                </td>
                <td>{r.name}</td>
                <td>{hoursText(r.hours)}</td>
                <td>{r.pay != null ? money(r.pay) : 'Not set'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section className="section printable">
      <h2>Caregivers on your shifts</h2>
      <p className="hint print-only">
        {home.name}. {formatDate(from)} to {formatDate(to)}.
      </p>

      <div className="row no-print">
        <div className="field">
          <label htmlFor="rp-from">From</label>
          <input id="rp-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rp-to">To</label>
          <input id="rp-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!loaded ? (
        <p className="hint">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="hint">
          No caregivers were on your shifts between these dates. Accept an applicant and they will appear here.
        </p>
      ) : (
        <>
          <div className="stats">
            <div>
              <strong>{byPerson.length}</strong>
              <span>{byPerson.length === 1 ? 'caregiver' : 'caregivers'}</span>
            </div>
            <div>
              <strong>{rows.length}</strong>
              <span>{rows.length === 1 ? 'shift' : 'shifts'}</span>
            </div>
            <div>
              <strong>{hoursText(totalHours)}</strong>
              <span>hours</span>
            </div>
            <div>
              <strong>{money(totalPay)}</strong>
              <span>est. pay</span>
            </div>
          </div>

          <h3>By caregiver</h3>
          <div className="table-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  <th scope="col">Caregiver</th>
                  <th scope="col">Shifts</th>
                  <th scope="col">Hours</th>
                  <th scope="col">Est. pay</th>
                  <th scope="col">Your rating</th>
                </tr>
              </thead>
              <tbody>
                {byPerson.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.shifts}</td>
                    <td>{hoursText(p.hours)}</td>
                    <td>{p.pay != null ? money(p.pay) : 'Not set'}</td>
                    <td>{p.rating != null ? `${p.rating.toFixed(1)} of 5` : 'Not rated'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {upcoming.length > 0 && (
            <>
              <h3>Coming up</h3>
              {table(upcoming)}
            </>
          )}

          {worked.length > 0 && (
            <>
              <h3>Worked</h3>
              {table(worked)}
            </>
          )}

          <p className="hint">
            Hours and pay are worked out from the times and rate on each shift. They are estimates, not a
            payroll record.
          </p>

          <div className="row no-print">
            <button type="button" className="btn secondary" onClick={downloadCsv}>
              Download spreadsheet
            </button>
            <button type="button" className="btn" onClick={() => window.print()}>
              Print or save PDF
            </button>
          </div>
        </>
      )}
    </section>
  );
}
