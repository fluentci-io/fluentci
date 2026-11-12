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
    try {
      if (
        location.pathname !== "/oauth/callback" &&
        !sessionStorage.getItem("fluentci-account")
      ) {
        setLoading(false);
        return;
      }
    } catch {
      setLoading(false);
      return;
    }
    let mounted = true;
    void import("../../auth/client")
      .then((auth) => auth.restore())
      .then((value) => {
        if (mounted) setAccount(value);
      })
      .catch((reason: unknown) => {
        if (mounted)
          setError(
            reason instanceof Error ? reason.message : "Unable to sign in.",
          );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  const logout = () => {
    if (account)
      void import("../../auth/client").then((auth) => auth.signOut(account));
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
