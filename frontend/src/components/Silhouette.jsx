/** Hình người đứng thẳng (trang trí, D-37): nét `line-strong` trên nền do nơi dùng quyết định. */
export function Silhouette({ className = '' }) {
  return (
    <svg
      viewBox="0 0 120 240"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="var(--color-line-strong)"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="60" cy="34" r="20" />
      <path d="M38 78 C38 70 48 66 60 66 C72 66 82 70 82 78 L86 140 L74 140 L72 232 L62 232 L60 160 L58 232 L48 232 L46 140 L34 140 Z" />
    </svg>
  );
}
