import { cn } from "@/lib/utils";

/**
 * EzPickle mark, drawn as inline SVG so it stays crisp at any size, works
 * offline, and needs no image request. Matches the brand paddle + ball lockup.
 */
export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 48 48" className="size-8 shrink-0" role="img" aria-label="EzPickle">
        <path
          d="M30.5 6.5c5.6 0 9.5 4 9.5 9.6 0 3-1 5.6-2.7 7.9l-6.4 8.6c-1 1.4-2.6 2.2-4.3 2.2h-3.2l-4.1 7.4a2 2 0 0 1-2.8.7l-3.1-1.9a2 2 0 0 1-.7-2.7l4.3-7.3-1.6-2.8a5 5 0 0 1 .3-5.4l6.2-8.4c2.3-3.1 5.3-4.9 8.6-4.9Z"
          fill="currentColor"
          className="text-white"
        />
        <circle cx="33" cy="20" r="8.2" fill="#6FCF2B" stroke="#0A0A0A" strokeWidth="1.6" />
        <g fill="#0A0A0A">
          <circle cx="30" cy="16.6" r="1.15" />
          <circle cx="35.8" cy="17.4" r="1.15" />
          <circle cx="29.4" cy="22.6" r="1.15" />
          <circle cx="35.2" cy="23.2" r="1.15" />
          <circle cx="32.6" cy="19.8" r="1.15" />
        </g>
        <g fill="#6FCF2B">
          <rect x="1" y="12.5" width="15" height="3.2" rx="1.6" transform="skewX(-18)" />
          <rect x="0" y="18.4" width="13" height="3.2" rx="1.6" transform="skewX(-18)" />
          <rect x="2" y="24.3" width="15" height="3.2" rx="1.6" transform="skewX(-18)" />
        </g>
      </svg>
      {showWordmark && (
        <span className="text-[19px] font-extrabold tracking-tight">
          <span className="text-pickle-500">Ez</span>
          <span className="text-white">Pickle</span>
        </span>
      )}
    </span>
  );
}
