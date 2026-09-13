export function CommandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M5 5h22v22H5z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 10h5m-2.5 0v12M8 22h5m3 0V10l4 6 4-6v12" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
