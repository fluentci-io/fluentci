import type { RefObject } from "react";
import { SearchIcon } from "../SearchIcon";

export function FunctionSearch({
  value,
  onChange,
  onFocus,
  onBlur,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  inputRef: RefObject<HTMLInputElement>;
}) {
  return (
    <div className="mb-7 flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2.5 text-muted focus-within:border-accent">
      <SearchIcon />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onChange("");
            event.currentTarget.blur();
          }
        }}
        placeholder="Search for functions"
        aria-label="Search for functions"
        aria-keyshortcuts="f"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
      />
      <kbd
        className="rounded border border-line px-1.5 font-mono text-[10px]"
        aria-hidden="true"
      >
        F
      </kbd>
    </div>
  );
}
