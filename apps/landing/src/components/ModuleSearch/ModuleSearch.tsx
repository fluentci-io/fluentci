import { useEffect, useRef, useState } from "react";
import { initialResults } from "../../registry/client";
import { SearchIcon } from "../SearchIcon";
import { SearchDialog } from "../SearchDialog";

export function ModuleSearch() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void initialResults().catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
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
          }}
        />
      )}
    </>
  );
}
