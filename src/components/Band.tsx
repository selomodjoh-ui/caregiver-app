import type { ReactNode } from 'react';

interface Props {
  title: string;
  lead?: string;
  children?: ReactNode;
}

/** The coloured header at the top of every screen. */
export default function Band({ title, lead, children }: Props) {
  return (
    <header className="band">
      <svg className="band-art" aria-hidden="true" viewBox="0 0 200 200">
        <circle cx="150" cy="40" r="46" fill="#FFC94A" />
        <circle cx="96" cy="118" r="58" fill="#12908E" />
        <circle cx="172" cy="150" r="64" fill="#8F86E8" />
      </svg>
      <div className="band-inner">
        <div className="brand">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"
              fill="#FFC94A"
            />
          </svg>
          Caregiver App
        </div>
        <h1>{title}</h1>
        {lead && <p className="band-lead">{lead}</p>}
        {children}
      </div>
    </header>
  );
}
