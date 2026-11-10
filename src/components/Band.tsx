import type { ReactNode } from 'react';

interface Props {
  title: string;
  lead?: string;
  children?: ReactNode;
}

/** The header at the top of every screen. */
export default function Band({ title, lead, children }: Props) {
  return (
    <header className="band">
      <svg className="band-art" aria-hidden="true" viewBox="0 0 230 120" preserveAspectRatio="xMaxYMax meet">
        <path d="M70 120 L150 38 L176 66 L196 48 L230 86 L230 120 Z" fill="#cfdcd4" />
        <path d="M150 38 L163 52 L152 56 L142 50 Z" fill="#f2f6f3" />
        <path d="M40 120 l14 -34 l14 34 z M58 120 l11 -26 l11 26 z M196 120 l12 -30 l12 30 z" fill="#b5c9be" />
      </svg>
      <div className="band-inner">
        <div className="brand">
          <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="#0f4d3f" />
            <path
              d="M12 18s-3.6-2.2-3.6-5a2 2 0 0 1 3.6-1.3A2 2 0 0 1 15.6 13c0 2.8-3.6 5-3.6 5z"
              fill="#f6a48a"
            />
          </svg>
          ShiftKind
        </div>
        <h1>{title}</h1>
        {lead && <p className="band-lead">{lead}</p>}
        {children}
      </div>
    </header>
  );
}
