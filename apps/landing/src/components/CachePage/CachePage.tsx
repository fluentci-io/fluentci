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
import { getProfiles, httpUrl, type Profile } from "../../registry/client";
import { Copy } from "../Copy";
import { UserIcon } from "../UserIcon";
import { SearchIcon } from "../SearchIcon";
import { UploadTokenList } from "./UploadTokenList";
import { CachePageSkeleton, CacheTableSkeleton } from "./CacheSkeleton";

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
        <div className="min-w-0">
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
            <CachePageSkeleton />
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
  const [panel, setPanel] = useState("storage");
  const [collaboratorSearch, setCollaboratorSearch] = useState("");
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [collaboratorProfiles, setCollaboratorProfiles] = useState<
    Record<string, Profile>
  >({});
  const [collaboratorCursor, setCollaboratorCursor] = useState<string>();
  const [collaboratorsLoaded, setCollaboratorsLoaded] = useState(false);
  const [actor, setActor] = useState("");
  const ownActor = actor.trim().replace(/^@+/, "").toLowerCase();
  const selfActor =
    ownActor === account.did.toLowerCase() ||
    Boolean(
      account.profile?.handle &&
      ownActor === account.profile.handle.toLowerCase(),
    );
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
    if (!upload?.expiresAt) return;
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
        {},
        signal,
      );
      if (!signal.aborted) setUpload(value);
    });
  };
  return (
    <div className="mt-8 grid items-start gap-8 md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="md:sticky md:top-24">
        <nav
          aria-label="Cache navigation"
          className="grid grid-cols-2 gap-1 rounded-xl bg-panel p-2 md:grid-cols-1"
        >
          {[
            ["storage", "Cache entries"],
            ["collaborators", "Collaborators"],
            ["tokens", "Upload tokens"],
            ["ci", "CI credentials"],
          ].map(([id, name]) => (
            <button
              key={id}
              type="button"
              aria-current={panel === id ? "page" : undefined}
              className={`rounded-lg px-3 py-2.5 text-left text-sm ${panel === id ? "bg-raised text-accent" : "text-muted hover:bg-raised hover:text-ink"}`}
              disabled={!authorized}
              onClick={() => {
                setPanel(id);
                setError("");
                setNotice("");
                if (id === "collaborators" && !collaboratorsLoaded)
                  void perform((signal) => listCollaborators(signal));
              }}
            >
              {name}
            </button>
          ))}
          <a
            className="rounded-lg px-3 py-2.5 text-left text-sm text-muted hover:bg-raised hover:text-ink"
            href="https://docs.fluentci.io/guides/build-cache/"
            target="_blank"
            rel="noreferrer"
          >
            Documentation ↗
          </a>
        </nav>
      </aside>
      <div className="min-w-0 space-y-6">
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
          <section className="rounded-xl bg-panel p-6">
            <h2 className="text-xl">Authorize cache access</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Your existing session needs permission to manage cache tokens and
              invitations. Continue with your AT Protocol account to grant
              access.
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
            <section
              hidden={panel !== "tokens"}
              className="rounded-xl bg-panel p-6 sm:p-8"
            >
              <h2 className="text-xl">Upload token</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Generate an upload token for your cache. Tokens remain valid
                until you revoke them.
              </p>
              <form className="mt-5" onSubmit={submitToken}>
                <button className={button} disabled={pending}>
                  {pending
                    ? "Working…"
                    : upload
                      ? "Generate another token"
                      : "Generate upload token"}
                </button>
              </form>
              {upload && (
                <div className="mt-6 border-t border-line pt-5">
                  <p className="text-xs text-muted">
                    {upload.expiresAt
                      ? `Expires ${new Date(upload.expiresAt).toLocaleString()}`
                      : "Never expires · valid until revoked"}
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
                    bearer token or Basic-auth password. Renewing does not
                    revoke an earlier token.
                  </p>
                  <TokenInstructions cacheUrl={upload.cacheUrl} />
                </div>
              )}
              <UploadTokenList
                account={account}
                enabled={panel === "tokens"}
                refreshKey={upload?.id}
                onRevoke={(id) => {
                  if (upload?.id === id) setUpload(undefined);
                }}
              />
            </section>
            <section
              hidden={panel !== "collaborators"}
              className="rounded-xl bg-panel p-6 sm:p-8"
            >
              <h2 className="text-xl">Collaborators</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Invite teammates to upload to your cache using their own AT
                Protocol accounts.
              </p>
              <label className="mt-5 block text-sm" htmlFor="cache-actor">
                Collaborator handle or DID
              </label>
              <CollaboratorInput
                value={actor}
                change={setActor}
                disabled={pending}
                self={account}
              />
              {selfActor && (
                <p className="mt-2 text-xs text-muted">
                  You already own this cache and cannot invite yourself.
                </p>
              )}
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
                    disabled={pending || !actor.trim() || selfActor}
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
                              : "Upload access revoked. Revoke existing upload tokens individually.",
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
                <label
                  className="mt-4 block text-sm"
                  htmlFor="collaborator-filter"
                >
                  Search collaborators
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute bottom-0 left-4 top-2 flex items-center text-muted">
                    <SearchIcon />
                  </span>
                  <input
                    id="collaborator-filter"
                    type="search"
                    className={`${field} pl-11`}
                    value={collaboratorSearch}
                    onChange={(event) =>
                      setCollaboratorSearch(event.target.value)
                    }
                    placeholder="Filter by handle, name, or DID"
                  />
                </div>
                <div className="mt-4 overflow-x-auto rounded-lg border border-line">
                  <table
                    className="w-full table-fixed text-left text-sm"
                    aria-label="Collaborators"
                  >
                    <thead className="border-b border-line bg-raised text-xs text-muted">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-medium">
                          Collaborator
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                          Access
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {pending && !collaboratorsLoaded && (
                        <CacheTableSkeleton
                          columns={3}
                          label="Loading collaborators"
                        />
                      )}
                      {collaborators
                        .filter((did) =>
                          [
                            did,
                            collaboratorProfiles[did]?.handle,
                            collaboratorProfiles[did]?.displayName,
                          ]
                            .join(" ")
                            .toLowerCase()
                            .includes(collaboratorSearch.toLowerCase()),
                        )
                        .map((did) => (
                          <tr key={did}>
                            <td className="max-w-sm px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span
                                  className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised text-muted"
                                  aria-hidden="true"
                                >
                                  <UserIcon />
                                  {httpUrl(
                                    collaboratorProfiles[did]?.avatar,
                                  ) && (
                                    <img
                                      key={collaboratorProfiles[did].avatar}
                                      src={httpUrl(
                                        collaboratorProfiles[did].avatar,
                                      )}
                                      alt=""
                                      className="absolute inset-0 size-full object-cover"
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                      onError={(event) => {
                                        event.currentTarget.style.display =
                                          "none";
                                      }}
                                    />
                                  )}
                                </span>
                                <div className="min-w-0">
                                  <p className="break-all">
                                    {collaboratorProfiles[did]?.handle
                                      ? `@${collaboratorProfiles[did].handle}`
                                      : did}
                                  </p>
                                  {collaboratorProfiles[did]?.displayName && (
                                    <p className="mt-1 text-xs text-muted">
                                      {collaboratorProfiles[did].displayName}
                                    </p>
                                  )}
                                  {collaboratorProfiles[did]?.handle && (
                                    <p className="mt-1 break-all font-mono text-xs text-muted">
                                      {did}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted">
                              Upload
                            </td>
                            <td className="px-4 py-3 text-right">
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
                                        "Upload access revoked. Revoke existing upload tokens individually.",
                                      );
                                  })
                                }
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      {collaboratorsLoaded &&
                        collaborators.filter((did) =>
                          [
                            did,
                            collaboratorProfiles[did]?.handle,
                            collaboratorProfiles[did]?.displayName,
                          ]
                            .join(" ")
                            .toLowerCase()
                            .includes(collaboratorSearch.toLowerCase()),
                        ).length === 0 && (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-4 py-8 text-center text-muted"
                            >
                              {collaborators.length === 0
                                ? "No invited collaborators."
                                : "No matching collaborators."}
                            </td>
                          </tr>
                        )}
                    </tbody>
                  </table>
                </div>
                {collaboratorCursor && (
                  <p className="mt-3 text-xs text-muted">
                    Search filters loaded collaborators. Load more to search
                    additional entries.
                  </p>
                )}
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
            <div hidden={panel !== "storage"}>
              <CacheObjects account={account} />
            </div>
            <section
              hidden={panel !== "ci"}
              className="rounded-xl bg-panel p-6 sm:p-8"
            >
              <h2 className="text-xl">CI credentials</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Create a revocable credential for your own cache. Save it in
                your CI secret store and exchange it for a fresh upload token on
                every run. Credentials expire after 90 days.
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
                    Copy this credential now. Its secret will not be shown
                    again.
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
                                    "CI credential revoked. Revoke existing upload tokens individually.",
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
    </div>
  );
}

function CollaboratorInput({
  value,
  change,
  disabled,
  self,
}: {
  value: string;
  change: (value: string) => void;
  disabled: boolean;
  self: Account;
}) {
  const [suggest, setSuggest] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const suggestions = useHandleSuggestions(
    value,
    suggest && !disabled && !value.startsWith("did:"),
  );
  const items = suggestions.items.filter((profile) => profile.did !== self.did);
  const show =
    suggest && !disabled && (suggestions.loading || items.length > 0);
  const select = (profile: Profile) => {
    change(profile.handle);
    setSuggest(false);
    setActive(-1);
    input.current?.focus();
  };
  return (
    <>
      <div className="relative">
        <span className="pointer-events-none absolute bottom-0 left-4 top-2 flex items-center text-muted">
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="7" r="4" />
            <path d="M2 21v-2a7 7 0 0 1 14 0v2M20 8v6m-3-3h6" />
          </svg>
        </span>
        <input
          ref={input}
          className={`${field} pl-11`}
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
                items.length
                  ? (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      items.length) %
                    items.length
                  : -1,
              );
            } else if (event.key === "Enter" && items[active]) {
              event.preventDefault();
              select(items[active]);
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
      </div>
      {show && (
        <HandleSuggestions
          id="cache-invite-suggestions"
          items={items}
          loading={suggestions.loading}
          active={active}
          select={select}
        />
      )}
    </>
  );
}
