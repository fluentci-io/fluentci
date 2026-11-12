import { HandleSuggestions } from "../HandleSuggestions";
import { useHandleSuggestions } from "./useHandleSuggestions";
import type { Profile } from "../../registry/client";
import { useEffect, useRef, useState, type FormEvent } from "react";

export function SignInDialog({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [handle, setHandle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [suggest, setSuggest] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = useHandleSuggestions(handle, suggest && !pending);
  const showSuggestions =
    suggest &&
    !pending &&
    (suggestions.loading || suggestions.items.length > 0);
  const select = (profile: Profile) => {
    setHandle(profile.handle);
    setSuggest(false);
    setActive(-1);
    input.current?.focus();
  };
  useEffect(() => {
    dialog.current?.showModal();
    input.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  const submit = async (create = false) => {
    setPending(true);
    setSuggest(false);
    setError("");
    try {
      const auth = await import("../../auth/client");
      await auth.signIn(handle, create);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to start sign-in. Try again.",
      );
      setPending(false);
    }
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };
  return (
    <dialog
      ref={dialog}
      className="auth-dialog"
      aria-labelledby="sign-in-title"
      onCancel={close}
      onClose={close}
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
    >
      <div className="relative p-7 sm:p-9">
        <button
          className="absolute right-4 top-4 flex size-8 items-center justify-center rounded text-muted hover:text-ink"
          type="button"
          aria-label="Close sign in"
          onClick={close}
        >
          ×
        </button>
        <h2 id="sign-in-title" className="text-2xl">
          Sign in to FluentCI
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          One account for the whole Atmosphere.
        </p>
        <form className="mt-7" onSubmit={onSubmit}>
          <label className="text-xs" htmlFor="atproto-handle">
            Handle
          </label>
          <div className="relative mt-2">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted"
            >
              @
            </span>
            <input
              ref={input}
              id="atproto-handle"
              className="w-full rounded-lg border border-line bg-paper pl-9 pr-4 py-3 text-sm outline-none focus:border-accent"
              placeholder="name.bsky.social"
              value={handle}
              onChange={(event) => {
                setHandle(event.target.value.replace(/^@+/, ""));
                setSuggest(true);
                setActive(-1);
              }}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSuggestions}
              aria-controls="handle-suggestions"
              aria-activedescendant={
                showSuggestions && active >= 0
                  ? `handle-option-${active}`
                  : undefined
              }
              onKeyDown={(event) => {
                if (!showSuggestions) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((value) =>
                    suggestions.items.length
                      ? (value +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          suggestions.items.length) %
                        suggestions.items.length
                      : -1,
                  );
                } else if (
                  event.key === "Enter" &&
                  active >= 0 &&
                  suggestions.items[active]
                ) {
                  event.preventDefault();
                  select(suggestions.items[active]);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setSuggest(false);
                }
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={254}
              disabled={pending}
            />
          </div>
          {showSuggestions && (
            <HandleSuggestions
              items={suggestions.items}
              loading={suggestions.loading}
              active={active}
              select={select}
            />
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {error}
            </p>
          )}
          <button
            className="mt-5 w-full rounded-lg bg-accent px-4 py-3 text-sm font-medium text-paper disabled:opacity-60"
            type="submit"
            disabled={pending}
          >
            {pending ? "Connecting…" : "Continue"}
          </button>
        </form>
        <div className="mt-6 space-y-3 text-xs leading-6">
          <a
            className="text-link block"
            href="https://atmosphereaccount.com"
            target="_blank"
            rel="noreferrer"
          >
            What is an Atmosphere account? ↗
          </a>
          <a
            className="text-link block"
            href="https://selfhosted.social/signup"
            aria-disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              if (!pending) void submit(true);
            }}
          >
            Create an account on selfhosted.social ↗
          </a>
        </div>
      </div>
    </dialog>
  );
}
