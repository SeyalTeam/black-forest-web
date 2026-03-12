type IconProps = {
  className?: string;
};

export function PinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M12 21c-.4 0-.8-.2-1-.5C7 15.4 5 12.6 5 9.5 5 5.9 8 3 12 3s7 2.9 7 6.5c0 3.1-2 5.9-6 11-.2.3-.6.5-1 .5Z"
        fill="currentColor"
      />
      <circle cx="12" cy="9.5" r="2.8" fill="#d97937" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M16.2 16.2 21 21" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}

export function MicIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor" />
      <path
        d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ProfileIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="12" cy="8.2" r="4.2" fill="#d58a56" />
      <path d="M5 20c1.4-3.9 4-5.8 7-5.8s5.6 1.9 7 5.8" fill="#d58a56" />
    </svg>
  );
}

export function BackIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M15.5 5.5 9 12l6.5 6.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

export function VegIcon({
  isVeg,
  className,
}: IconProps & {
  isVeg: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        borderRadius: 4,
        border: `1.6px solid ${isVeg ? "#16a34a" : "#ef4f5f"}`,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: isVeg ? "50%" : "2px",
          background: isVeg ? "#16a34a" : "#ef4f5f",
          transform: isVeg ? undefined : "rotate(45deg)",
        }}
      />
    </span>
  );
}
