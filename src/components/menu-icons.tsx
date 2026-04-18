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

export function HomeNavIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M4.5 10.8 12 4.8l7.5 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.8 9.8V19a1 1 0 0 0 1 1h8.4a1 1 0 0 0 1-1V9.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MenuNavIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect
        x="4"
        y="5"
        width="16"
        height="3"
        rx="1.5"
        fill="currentColor"
      />
      <rect
        x="4"
        y="10.5"
        width="16"
        height="3"
        rx="1.5"
        fill="currentColor"
      />
      <rect
        x="4"
        y="16"
        width="16"
        height="3"
        rx="1.5"
        fill="currentColor"
      />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M9 5.5 15.5 12 9 18.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M12 4.5a4.5 4.5 0 0 0-4.5 4.5v2.1c0 .9-.3 1.8-.9 2.5l-1.2 1.6c-.4.5-.1 1.3.6 1.3h12c.7 0 1-.8.6-1.3l-1.2-1.6c-.6-.7-.9-1.6-.9-2.5V9A4.5 4.5 0 0 0 12 4.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 18.5a2.1 2.1 0 0 0 4 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CallWaiterIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="m6.2 4.8 2.1-1.3a1.2 1.2 0 0 1 1.7.5l1.6 3.1a1.2 1.2 0 0 1-.3 1.5L9.8 10a13 13 0 0 0 4.1 4.1l1.3-1.5a1.2 1.2 0 0 1 1.5-.3l3.1 1.6a1.2 1.2 0 0 1 .5 1.7l-1.3 2.1a2.4 2.4 0 0 1-2.5 1.1A15.8 15.8 0 0 1 4.9 7.3a2.4 2.4 0 0 1 1.3-2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Move4WayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M12 4v16M4 12h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="m12 3-2.3 2.3M12 3l2.3 2.3M21 12l-2.3-2.3M21 12l-2.3 2.3M12 21l-2.3-2.3M12 21l2.3-2.3M3 12l2.3-2.3M3 12l2.3 2.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function CartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="9" cy="19" r="1.7" fill="currentColor" />
      <circle cx="17" cy="19" r="1.7" fill="currentColor" />
      <path
        d="M3.5 5h2.2l1.4 8.2a1.2 1.2 0 0 0 1.2 1h7.9a1.2 1.2 0 0 0 1.2-.9L19 8H7.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BagIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M7.5 8.5V7a4.5 4.5 0 0 1 9 0v1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6 8.5h12l-.7 9.1a1.5 1.5 0 0 1-1.5 1.4H8.2a1.5 1.5 0 0 1-1.5-1.4L6 8.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NoteAddIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="m4.4 15.9 1-.2 2.8-2.8-1.8-1.8-2.8 2.8-.2 1a.6.6 0 0 0 .7.7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m7.2 10.3 1.8 1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="m8.2 9.3 4-4a1.5 1.5 0 0 1 2.1 0l1.3 1.3a1.5 1.5 0 0 1 0 2.1l-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 18.2c1.1-.9 2-.9 3.1 0 .9.8 1.8.8 2.9 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function NoteSavedIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="3.5" fill="#1f8cf7" />
      <rect x="8" y="2.6" width="8" height="4.2" rx="2.1" fill="#5cb2ff" />
      <path
        d="m9.2 15.8.5-2.6 5.9-5.9a1.3 1.3 0 0 1 1.8 0l.7.7a1.3 1.3 0 0 1 0 1.8l-5.9 5.9-2.6.5a.35.35 0 0 1-.4-.4Z"
        fill="#ffffff"
      />
      <path
        d="m13.8 8.9 1.8 1.8"
        fill="none"
        stroke="#1f8cf7"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M9.8 16.1 11 15l-1.1-1.1-.1.6Z"
        fill="#d9efff"
      />
    </svg>
  );
}

export function HistoryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M4.5 7.5V3.8M4.5 7.5h3.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.3 11.2a7.3 7.3 0 1 1 2.1 5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 8.2v4.1l2.7 1.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M6 6l12 12M18 6 6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TableIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M4.5 8.5h15v3.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V8.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M7 13v6M17 13v6M9.5 8.5V5.5h5V8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CashIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect
        x="3.5"
        y="6"
        width="17"
        height="12"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M6.5 9.5h1.2M16.3 14.5h1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function UpiIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M7 4.5v6.2M12 4.5v6.2M17 4.5v6.2M7 13.3v6.2M12 13.3v6.2M17 13.3v6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M4.5 7.6h15M4.5 16.4h15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CardPaymentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M3.5 10h17"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M7 14h3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PrepTimeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle
        cx="12"
        cy="13"
        r="6.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 13V9.8M12 13l2.1 1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9.4 3.8h5.2M12 3.8v1.6M17 6.6l1.5-1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
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
