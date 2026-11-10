import {
  CREDENTIAL_LABELS,
  formatDate,
  isCurrent,
  todayText,
  type CaregiverCard,
  type CredentialSummary,
} from '../../lib/types';

interface Props {
  homeName: string;
  card: CaregiverCard | undefined;
  credentials: CredentialSummary[];
  shiftTitle: string;
  onClose: () => void;
}

/** A printable summary of a caregiver's credentials, for the home's records. */
export default function CredentialReport({ homeName, card, credentials, shiftTitle, onClose }: Props) {
  return (
    <div className="report" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className="report-page">
        <h2 id="report-title">Credential report</h2>
        <dl className="card">
          <div>
            <dt>Caregiver</dt>
            <dd>{card ? `${card.first_name} ${card.surname_initial}.` : 'Caregiver'}</dd>
          </div>
          <div>
            <dt>Prepared for</dt>
            <dd>{homeName}</dd>
          </div>
          <div>
            <dt>Shift</dt>
            <dd>{shiftTitle}</dd>
          </div>
          <div>
            <dt>Date of report</dt>
            <dd>{formatDate(todayText())}</dd>
          </div>
        </dl>

        {credentials.length === 0 ? (
          <p className="hint">This caregiver has not added any credentials.</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">Credential</th>
                <th scope="col">Status</th>
                <th scope="col">Expires</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map((c) => (
                <tr key={c.kind}>
                  <td>{CREDENTIAL_LABELS[c.kind] ?? c.kind}</td>
                  <td>
                    {!isCurrent(c) ? 'Expired' : c.status === 'verified' ? 'Verified against state record' : 'On file, not yet verified'}
                  </td>
                  <td>{c.expires_on ? formatDate(c.expires_on) : 'No date given'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="hint">
          This report shows what the caregiver has put on file and what has been checked. It does
          not replace the home's own background check.
        </p>

        <div className="row no-print">
          <button type="button" className="btn secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            Print or save as PDF
          </button>
        </div>
      </div>
    </div>
  );
}
