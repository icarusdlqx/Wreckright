export function CommandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M5 5h22v22H5z" stroke="currentColor" strokeWidth="1.2" />
      <path d="m9 10 3 12 4-7 4 7 3-12M11 10h10M16 6v4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
