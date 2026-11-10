import type { ReactNode } from 'react';

export interface Tab<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
}

interface Props<T extends string> {
  tabs: Tab<T>[];
  current: T;
  onChange: (id: T) => void;
}

export default function TabBar<T extends string>({ tabs, current, onChange }: Props<T>) {
  return (
    <nav className="tabs" aria-label="Main">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={tab.id === current ? 'on' : ''}
          aria-current={tab.id === current ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function icon(paths: ReactNode) {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths}
    </svg>
  );
}

export const icons = {
  shifts: icon(
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </>,
  ),
  clock: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
  ),
  shield: icon(
    <>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>,
  ),
  chat: icon(<path d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />),
  person: icon(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
    </>,
  ),
  search: icon(
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </>,
  ),
  report: icon(
    <>
      <path d="M5 20V10M12 20V4M19 20v-7" />
      <path d="M3 20h18" />
    </>,
  ),
  home: icon(
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v10h12V10" />
      <path d="M10 20v-5h4v5" />
    </>,
  ),
};
