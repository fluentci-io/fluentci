// Heart paths copied from Rocksky apps/web/src/components/Icons/{Heart,HeartOutline}.
export function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
    >
      {filled ? (
        <path
          fill="currentColor"
          d="M10 17c-.247 0-.488-.071-.692-.203-3.023-1.945-4.332-3.279-5.053-4.113C2.716 10.907 1.98 9.082 2 7.106 2.025 4.842 3.941 3 6.273 3c1.695 0 2.869.905 3.553 1.659a.236.236 0 0 0 .348 0C10.858 3.905 12.032 3 13.727 3 16.059 3 17.975 4.842 18 7.107c.02 1.976-.717 3.801-2.255 5.578-.721.834-2.03 2.167-5.053 4.112A1.275 1.275 0 0 1 10 17Z"
        />
      ) : (
        <path
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.534 4C11.167 4 10 6.364 10 6.364S8.833 4 6.466 4C4.543 4 3.02 5.63 3 7.575c-.04 4.038 3.162 6.91 6.672 9.323a.578.578 0 0 0 .656 0c3.51-2.413 6.712-5.285 6.672-9.323C16.98 5.63 15.457 4 13.534 4Z"
        />
      )}
    </svg>
  );
}
