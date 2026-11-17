import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/context";
import type { Account } from "../../auth/client";
import { hasCachePermissions } from "../../auth/permissions";
import {
  cacheRequest,
  CachePermissionError,
  type Credential,
  type NewCredential,
  type UploadToken,
} from "../../cache/client";
import { SiteHeader } from "../SiteHeader";
import { SiteFooter } from "../SiteFooter";
import { TokenInstructions } from "./TokenInstructions";
import { CacheObjects } from "./CacheObjects";
import { HandleSuggestions } from "../HandleSuggestions";
import { useHandleSuggestions } from "../SignInDialog/useHandleSuggestions";
import { getProfiles, type Profile } from "../../registry/client";
import { Copy } from "../Copy";

const field =
  "mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-accent";
const button =
  "rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50";
const secondary =
  "rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-raised disabled:opacity-50";

export function CachePage() {
  const { account, loading, openSignIn } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="page-width flex-1 py-12 sm:py-20">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-widest text-accent">
            Build cache
          </p>
          <h1 className="mt-3 text-3xl sm:text-4xl">
            Your cache, ready to share.
          </h1>
          <p className="mt-4 text-sm leading-7 text-muted">
            Generate upload tokens, invite collaborators, and connect CI. Cached
            files are public to anyone with their URL.
          </p>
          {loading ? (
            <p role="status" className="mt-8">
              Loading your account…
            </p>
          ) : account ? (
            <CacheSettings key={account.did} account={account} />
          ) : (
            <button className={`${button} mt-8`} onClick={openSignIn}>
              Sign in to manage cache
            </button>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Secret({ value, label }: { value: string; label: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        className={`${field} min-w-0 flex-1 font-mono`}
        aria-label={label}
        type={visible ? "text" : "password"}
        value={value}
        readOnly
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        className={secondary}
        onClick={() => setVisible(!visible)}
      >
        {visible ? "Hide" : "Show"}
      </button>
      <Copy text={value} label={`Copy ${label.toLowerCase()}`} iconOnly />
    </div>
  );
}

function CacheSettings({ account }: { account: Account }) {
  const { openSignIn } = useAuth();
  const [authorized, setAuthorized] = useState(() =>
    hasCachePermissions(account.agent.session.token.scope),
  );
  const [owner, setOwner] = useState("");
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [collaboratorProfiles, setCollaboratorProfiles] = useState<
    Record<string, Profile>
  >({});
  const [collaboratorCursor, setCollaboratorCursor] = useState<string>();
  const [collaboratorsLoaded, setCollaboratorsLoaded] = useState(false);
  const [actor, setActor] = useState("");
  const [label, setLabel] = useState("");
  const [upload, setUpload] = useState<UploadToken>();
  const [credential, setCredential] = useState<NewCredential>();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lifetime = useRef<AbortController>();
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!upload) return;
    const timer = setTimeout(
      () => {
        setUpload(undefined);
        setNotice(
          "Your upload token expired. Generate a new token to continue uploading.",
        );
      },
      Math.max(0, Date.parse(upload.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [upload]);
  async function perform(work: (signal: AbortSignal) => Promise<void>) {
    if (pending || !lifetime.current) return;
    const signal = lifetime.current.signal;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await work(signal);
    } catch (reason) {
      if (signal.aborted) return;
      if (reason instanceof CachePermissionError) setAuthorized(false);
      setError(
        reason instanceof Error ? reason.message : "The cache request failed.",
      );
    } finally {
      if (!signal.aborted) setPending(false);
    }
  }
  const list = async (signal: AbortSignal) => {
    const data = await cacheRequest<{ credentials: Credential[] }>(
      account,
      "listCredentials",
      {},
      signal,
    );
    if (!signal.aborted) setCredentials(data.credentials);
  };
  const listCollaborators = async (signal: AbortSignal, more = false) => {
    const data = await cacheRequest<{ actors: string[]; cursor?: string }>(
      account,
      "listCollaborators",
      more && collaboratorCursor ? { cursor: collaboratorCursor } : {},
      signal,
    );
    if (signal.aborted) return;
    setCollaborators((values) =>
      more ? [...values, ...data.actors] : data.actors,
    );
    setCollaboratorCursor(data.cursor);
    setCollaboratorsLoaded(true);
    try {
      const profiles = await getProfiles(data.actors, signal);
      if (!signal.aborted)
        setCollaboratorProfiles((values) => ({ ...values, ...profiles }));
    } catch {
      /* DIDs remain usable if profile lookup is unavailable. */
    }
  };
  const reauthorize = async () => {
    if (account.profile?.handle) {
      await perform(async () => {
        const { signIn } = await import("../../auth/client");
        await signIn(account.profile!.handle);
      });
    } else openSignIn();
  };
  const submitToken = (event: FormEvent) => {
    event.preventDefault();
    void perform(async (signal) => {
      setUpload(undefined);
      const value = await cacheRequest<UploadToken>(
        account,
        "createToken",
        owner.trim() ? { owner: owner.trim().replace(/^@/, "") } : {},
        signal,
      );
      if (!signal.aborted) setUpload(value);
    });
  };
  return (
    <div className="mt-10 space-y-8">
      {error && (
        <p role="alert" className="rounded-lg border border-line p-4 text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-accent">
          {notice}
        </p>
      )}
      {!authorized ? (
        <section className="rounded-xl border border-line bg-panel p-6">
          <h2 className="text-xl">Authorize cache access</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Your existing session needs permission to manage cache tokens and
            invitations. Continue with your AT Protocol account to grant access.
          </p>
          <button
            className={`${button} mt-5`}
            disabled={pending}
            onClick={() => void reauthorize()}
          >
            Authorize cache access
          </button>
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-line bg-panel p-6 sm:p-8">
            <h2 className="text-xl">Upload token</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Tokens last one hour. Leave the owner empty for your cache, or
              enter an owner who has invited you.
            </p>
            <form className="mt-5" onSubmit={submitToken}>
              <label className="text-sm" htmlFor="cache-owner">
                Cache owner (optional)
              </label>
              <input
                className={field}
                id="cache-owner"
                placeholder="handle.example or did:plc:…"
                value={owner}
                onChange={(e) => {
                  setOwner(e.target.value);
                  setUpload(undefined);
                }}
                disabled={pending}
              />
              <button className={`${button} mt-4`} disabled={pending}>
                {pending
                  ? "Working…"
                  : upload
                    ? "Renew upload token"
                    : "Generate upload token"}
              </button>
            </form>
            {upload && (
              <div className="mt-6 border-t border-line pt-5">
                <p className="text-xs text-muted">
                  Expires {new Date(upload.expiresAt).toLocaleString()}
                </p>
                <Secret
                  key={upload.token}
                  value={upload.token}
                  label="Upload token"
                />
                <label className="mt-5 block text-sm" htmlFor="cache-url">
                  Cache URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="cache-url"
                    readOnly
                    className={`${field} min-w-0 font-mono`}
                    value={upload.cacheUrl}
                  />
                  <Copy
                    text={upload.cacheUrl}
                    label="Copy cache URL"
                    iconOnly
                  />
                </div>
                <p className="mt-3 text-xs leading-6 text-muted">
                  Use this URL with your cache client and send the token as a
                  bearer token or Basic-auth password. Renewing does not revoke
                  an earlier token.
                </p>
                <TokenInstructions cacheUrl={upload.cacheUrl} />
              </div>
            )}
          </section>
          <section className="rounded-xl border border-line bg-panel p-6 sm:p-8">
            <h2 className="text-xl">Invite collaborators</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Manage upload access to your own cache. Invited users sign in and
              generate their own token using your handle as the cache owner.
            </p>
            <label className="mt-5 block text-sm" htmlFor="cache-actor">
              Collaborator handle or DID
            </label>
            <CollaboratorInput
              value={actor}
              change={setActor}
              disabled={pending}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              {(
                [
                  ["inviteUser", "Invite user"],
                  ["revokeUser", "Revoke access"],
                ] as const
              ).map(([method, title]) => (
                <button
                  key={method}
                  className={method === "inviteUser" ? button : secondary}
                  disabled={pending || !actor.trim()}
                  onClick={() =>
                    void perform(async (signal) => {
                      await cacheRequest(
                        account,
                        method,
                        { actor: actor.trim().replace(/^@/, "") },
                        signal,
                      );
                      await listCollaborators(signal);
                      if (!signal.aborted)
                        setNotice(
                          method === "inviteUser"
                            ? "Upload access granted. Share your handle with the collaborator."
                            : "Upload access revoked. Existing tokens expire within one hour.",
                        );
                    })
                  }
                >
                  {title}
                </button>
              ))}
            </div>
            <div className="mt-6 border-t border-line pt-5">
              <button
                className={secondary}
                disabled={pending}
                onClick={() =>
                  void perform((signal) => listCollaborators(signal))
                }
              >
                Refresh collaborators
              </button>
              {collaboratorsLoaded && collaborators.length === 0 && (
                <p className="mt-4 text-sm text-muted">
                  No invited collaborators.
                </p>
              )}
              <ul className="mt-4 space-y-3">
                {collaborators.map((did) => (
                  <li
                    key={did}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-line p-3"
                  >
                    <span className="min-w-0 break-all text-sm">
                      {collaboratorProfiles[did]?.handle
                        ? `@${collaboratorProfiles[did].handle}`
                        : did}
                    </span>
                    <button
                      className={secondary}
                      aria-label={`Remove ${collaboratorProfiles[did]?.handle ?? did}`}
                      disabled={pending}
                      onClick={() =>
                        void perform(async (signal) => {
                          await cacheRequest(
                            account,
                            "revokeUser",
                            { actor: did },
                            signal,
                          );
                          await listCollaborators(signal);
                          if (!signal.aborted)
                            setNotice(
                              "Upload access revoked. Existing tokens expire within one hour.",
                            );
                        })
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              {collaboratorCursor && (
                <button
                  className={`${secondary} mt-4`}
                  disabled={pending}
                  onClick={() =>
                    void perform((signal) => listCollaborators(signal, true))
                  }
                >
                  More collaborators
                </button>
              )}
            </div>
          </section>
          <CacheObjects account={account} />
          <section className="rounded-xl border border-line bg-panel p-6 sm:p-8">
            <h2 className="text-xl">CI credentials</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Create a revocable credential for your own cache. Save it in your
              CI secret store and exchange it for a fresh upload token on every
              run. Credentials expire after 90 days.
            </p>
            <form
              className="mt-5"
              onSubmit={(event) => {
                event.preventDefault();
                void perform(async (signal) => {
                  setCredential(undefined);
                  const value = await cacheRequest<NewCredential>(
                    account,
                    "createCredential",
                    { label: label.trim() },
                    signal,
                  );
                  if (!signal.aborted) {
                    setCredential(value);
                    setLabel("");
                  }
                  await list(signal);
                });
              }}
            >
              <label className="text-sm" htmlFor="credential-label">
                Credential name
              </label>
              <input
                className={field}
                id="credential-label"
                value={label}
                maxLength={80}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Release pipeline"
                disabled={pending}
                required
              />
              <button
                className={`${button} mt-4`}
                disabled={pending || !label.trim()}
              >
                Create CI credential
              </button>
            </form>
            {credential && (
              <div className="mt-5">
                <p className="text-sm">
                  Copy this credential now. Its secret will not be shown again.
                </p>
                <Secret
                  key={credential.id}
                  value={credential.credential}
                  label="CI credential"
                />
                <button
                  className="mt-3 text-xs text-muted underline"
                  onClick={() => setCredential(undefined)}
                >
                  Dismiss secret
                </button>
              </div>
            )}
            <div className="mt-6 border-t border-line pt-5">
              <button
                className={secondary}
                disabled={pending}
                onClick={() => void perform(list)}
              >
                Refresh credentials
              </button>
              {credentials.length > 0 && (
                <ul className="mt-4 divide-y divide-line">
                  {credentials.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-4"
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm">{item.label}</p>
                        <p className="mt-1 text-xs text-muted">
                          {!item.active
                            ? "Revoked"
                            : Date.parse(item.expiresAt) <= Date.now()
                              ? "Expired"
                              : `Expires ${new Date(item.expiresAt).toLocaleDateString()}`}
                        </p>
                      </div>
                      {item.active && (
                        <button
                          className={secondary}
                          disabled={pending}
                          onClick={() =>
                            void perform(async (signal) => {
                              await cacheRequest(
                                account,
                                "revokeCredential",
                                { id: item.id },
                                signal,
                              );
                              if (credential?.id === item.id)
                                setCredential(undefined);
                              await list(signal);
                              if (!signal.aborted)
                                setNotice(
                                  "CI credential revoked. Existing upload tokens expire within one hour.",
                                );
                            })
                          }
                        >
                          Revoke {item.label}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <a
              className="mt-5 inline-block text-sm text-accent underline"
              href="https://docs.fluentci.io/registry/cache/"
            >
              CI setup and token renewal instructions
            </a>
          </section>
        </>
      )}
    </div>
  );
}

function CollaboratorInput({
  value,
  change,
  disabled,
}: {
  value: string;
  change: (value: string) => void;
  disabled: boolean;
}) {
  const [suggest, setSuggest] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const suggestions = useHandleSuggestions(
    value,
    suggest && !disabled && !value.startsWith("did:"),
  );
  const show =
    suggest &&
    !disabled &&
    (suggestions.loading || suggestions.items.length > 0);
  const select = (profile: Profile) => {
    change(profile.handle);
    setSuggest(false);
    setActive(-1);
    input.current?.focus();
  };
  return (
    <>
      <input
        ref={input}
        className={field}
        id="cache-actor"
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={show}
        aria-controls="cache-invite-suggestions"
        aria-activedescendant={
          show && active >= 0
            ? `cache-invite-suggestions-option-${active}`
            : undefined
        }
        onChange={(event) => {
          change(event.target.value.replace(/^@+/, ""));
          setSuggest(true);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (!show) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) =>
              suggestions.items.length
                ? (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    suggestions.items.length) %
                  suggestions.items.length
                : -1,
            );
          } else if (event.key === "Enter" && suggestions.items[active]) {
            event.preventDefault();
            select(suggestions.items[active]);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setSuggest(false);
          }
        }}
        placeholder="teammate.example"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        disabled={disabled}
      />
      {show && (
        <HandleSuggestions
          id="cache-invite-suggestions"
          items={suggestions.items}
          loading={suggestions.loading}
          active={active}
          select={select}
        />
      )}
    </>
  );
}
