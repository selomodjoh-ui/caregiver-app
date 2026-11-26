/** Grey placeholder rows in the shape of the list that is on its way. */
export default function Skeleton({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" aria-hidden="true">
          <span className="skeleton-dot" />
          <span className="skeleton-lines">
            <span className="skeleton-line" style={{ width: `${[62, 48, 70][i % 3]}%` }} />
            <span className="skeleton-line short" style={{ width: `${[38, 52, 30][i % 3]}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}
