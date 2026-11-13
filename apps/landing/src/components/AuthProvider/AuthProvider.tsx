import {
  accountKey,
  endBrowserSession,
  prepareBrowserSession,
} from "../../auth/storage";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthContext } from "../../auth/context";
import type { Account } from "../../auth/client";
import { SignInDialog } from "../SignInDialog";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const queries = useQueryClient();
  useEffect(() => {
    let mounted = true;
    let generation = 0;
    const clearViewer = () => {
      queries.removeQueries({ queryKey: ["viewer-like"] });
      queries.removeQueries({ queryKey: ["viewer-likes"] });
    };
    const synchronize = async () => {
      const current = ++generation;
      let did: string | null;
      try {
        did = prepareBrowserSession();
      } catch {
        if (mounted) setLoading(false);
        return;
      }
      clearViewer();
      setAccount(null);
      setError("");
      if (location.pathname !== "/oauth/callback" && !did) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const auth = await import("../../auth/client");
        const value = await auth.restore();
        if (mounted && current === generation) setAccount(value);
      } catch (reason) {
        if (mounted && current === generation)
          setError(
            reason instanceof Error ? reason.message : "Unable to sign in.",
          );
      } finally {
        if (mounted && current === generation) setLoading(false);
      }
    };
    const storageChanged = (event: StorageEvent) => {
      if (
        event.storageArea === localStorage &&
        (event.key === null ||
          event.key === accountKey ||
          (event.key.startsWith("fluentci-oauth:sessions:") &&
            event.newValue === null))
      )
        void synchronize();
    };
    window.addEventListener("storage", storageChanged);
    void synchronize();
    return () => {
      mounted = false;
      generation++;
      window.removeEventListener("storage", storageChanged);
    };
  }, [queries]);
  const logout = () => {
    if (account) {
      const current = account;
      const revocation = current.agent.signOut();
      void revocation.catch(() => {});
      endBrowserSession();
      void import("../../auth/client").then((auth) =>
        auth.signOut(current, revocation),
      );
    }
    setAccount(null);
    queries.removeQueries({ queryKey: ["viewer-like"] });
    queries.removeQueries({ queryKey: ["viewer-likes"] });
  };
  return (
    <AuthContext.Provider
      value={{
        account,
        loading,
        error,
        openSignIn: () => setOpen(true),
        logout,
      }}
    >
      {children}
      {open && <SignInDialog close={() => setOpen(false)} />}
    </AuthContext.Provider>
  );
}
