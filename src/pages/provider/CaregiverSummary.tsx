import { CREDENTIAL_LABELS, isCurrent, type CaregiverCard, type CredentialSummary } from '../../lib/types';

interface Props {
  card: CaregiverCard | undefined;
  credentials: CredentialSummary[];
  /** When given, shows how many of these the caregiver holds. */
  required?: string[];
}

/** A caregiver's name and the credentials they hold, as a provider sees them. */
export default function CaregiverSummary({ card, credentials, required }: Props) {
  const current = credentials.filter((c) => isCurrent(c));
  const missing = (required ?? []).filter((kind) => !current.some((c) => c.kind === kind));

  return (
    <div className="person">
      <span className="avatar" aria-hidden="true">
        {card ? card.first_name.charAt(0).toUpperCase() : '?'}
      </span>
      <div className="list-main">
        <span className="list-title">{card ? `${card.first_name} ${card.surname_initial}.` : 'Caregiver'}</span>
        <span className="chips">
          {current.length === 0 && <span className="chip">No credentials added yet</span>}
          {current.map((c) => (
            <span key={c.kind} className={`chip ${c.status === 'verified' ? 'ok' : ''}`}>
              {CREDENTIAL_LABELS[c.kind] ?? c.kind}
              {c.status === 'verified' ? ', verified' : ', in review'}
            </span>
          ))}
          {missing.map((kind) => (
            <span key={kind} className="chip bad">
              Missing: {CREDENTIAL_LABELS[kind] ?? kind}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
