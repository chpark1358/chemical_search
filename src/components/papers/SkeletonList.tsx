export function LoadingBar() {
  return (
    <div
      aria-hidden="true"
      className="h-0.5 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div className="h-full w-1/3 animate-progress-slide rounded-full bg-primary" />
    </div>
  );
}

export default function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-xl border border-hairline bg-surface-1"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          className={`px-4 py-3 ${index > 0 ? "border-t border-hairline" : ""}`}
          key={index}
        >
          <div className="skeleton-shimmer h-3.5 w-3/5 rounded" />
          <div className="skeleton-shimmer mt-2 h-3 w-2/5 rounded" />
          <div className="skeleton-shimmer mt-2 h-3 w-1/3 rounded" />
        </div>
      ))}
    </div>
  );
}
