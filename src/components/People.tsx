type Hair = 'afro' | 'bun' | 'long' | 'headwrap' | 'hijab' | 'short';

interface Person {
  skin: string;
  hair: Hair;
  hairColor: string;
  scrubs: string;
}

/** Six caregivers, drawn to reflect the range of people who do this work. */
const PEOPLE: Person[] = [
  { skin: '#6b4226', hair: 'afro', hairColor: '#1f1410', scrubs: '#0f4d3f' },
  { skin: '#c68a5c', hair: 'long', hairColor: '#2a1a12', scrubs: '#f6a48a' },
  { skin: '#4f2f1c', hair: 'headwrap', hairColor: '#f6a48a', scrubs: '#1f7a5c' },
  { skin: '#f0c9a4', hair: 'short', hairColor: '#8c8f93', scrubs: '#0f4d3f' },
  { skin: '#8a5a3a', hair: 'bun', hairColor: '#1f1410', scrubs: '#e9b949' },
  { skin: '#b97a4e', hair: 'hijab', hairColor: '#145c44', scrubs: '#f6a48a' },
];

function Figure({ person, x }: { person: Person; x: number }) {
  const { skin, hair, hairColor, scrubs } = person;
  return (
    <g transform={`translate(${x} 0)`}>
      {hair === 'afro' && <circle cx="30" cy="27" r="21" fill={hairColor} />}
      {hair === 'long' && <rect x="13" y="15" width="34" height="44" rx="16" fill={hairColor} />}
      {hair === 'bun' && (
        <>
          <circle cx="30" cy="9" r="7" fill={hairColor} />
          <circle cx="30" cy="28" r="16" fill={hairColor} />
        </>
      )}
      {hair === 'short' && <circle cx="30" cy="28.5" r="15.5" fill={hairColor} />}
      {hair === 'headwrap' && <circle cx="30" cy="26" r="17.5" fill={hairColor} />}

      <path d="M4 88 C4 64 17 56 30 56 C43 56 56 64 56 88 Z" fill={scrubs} />
      <rect x="25" y="42" width="10" height="17" rx="4" fill={skin} />
      <path d="M24 57 L30 65 L36 57 Z" fill={skin} />

      {hair === 'hijab' && <path d="M30 8 C16 8 10 20 10 34 C10 50 14 62 30 66 C46 62 50 50 50 34 C50 20 44 8 30 8 Z" fill={hairColor} />}

      <circle cx="30" cy="32" r={hair === 'hijab' ? 12.5 : 14} fill={skin} />

      {hair === 'headwrap' && (
        <>
          <path d="M15 28 C17 14 43 14 45 28 C38 21 22 21 15 28 Z" fill={hairColor} />
          <circle cx="43" cy="13" r="5.5" fill={hairColor} />
        </>
      )}

      <circle cx="25.5" cy="31" r="1.4" fill="#1a0f0a" />
      <circle cx="34.5" cy="31" r="1.4" fill="#1a0f0a" />
      <path d="M25 36.5 Q30 41 35 36.5" stroke="#1a0f0a" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </g>
  );
}

export default function People() {
  return (
    <svg
      className="people"
      role="img"
      aria-label="Six caregivers of different backgrounds"
      viewBox="0 0 330 88"
    >
      {PEOPLE.map((person, i) => (
        <Figure key={i} person={person} x={i * 54} />
      ))}
    </svg>
  );
}
