import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "../SearchIcon";
import { SearchDialog } from "../SearchDialog";

export function ModuleSearch() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !target?.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable=false])",
        )
      ) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        ref={trigger}
        className="module-search-trigger"
        aria-haspopup="dialog"
        aria-label="Search module"
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
        <span>Search module</span>
        <kbd>/</kbd>
      </button>
      {open && (
        <SearchDialog
          close={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      )}
    </>
  );
}
