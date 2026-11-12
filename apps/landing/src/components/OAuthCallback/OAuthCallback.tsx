import { Link } from "@tanstack/react-router";
import { useAuth } from "../../auth/context";
export function OAuthCallback() {
  const { error, openSignIn } = useAuth();
  return <main className="page-width py-24"><h1 className="text-2xl">{error ? "Unable to sign in" : "Completing sign-in…"}</h1>{error && <><p role="alert" className="mt-4 text-sm text-muted">{error}</p><button type="button" className="text-link mt-6" onClick={openSignIn}>Try again</button></>}<Link className="mt-8 block text-sm text-muted" to="/">Back to FluentCI</Link></main>;
}
