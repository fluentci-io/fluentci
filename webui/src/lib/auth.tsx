// Local Studio never waits for a hosted authentication service.
import { type ComponentProps, type PropsWithChildren } from "react";
import * as Clerk from "@clerk/clerk-react";

export const hosted = location.hostname === "app.fluentci.io" ||
  !!import.meta.env.VITE_APP_API_URL?.includes("api.fluentci.io");

const localAuth = {
  isLoaded: true,
  isSignedIn: false,
  getToken: async () => null,
  signOut: async () => {},
};
export const useAuth = (): ReturnType<typeof Clerk.useAuth> => hosted
  ? Clerk.useAuth()
  : localAuth as ReturnType<typeof Clerk.useAuth>;
export const useUser = (): ReturnType<typeof Clerk.useUser> => hosted
  ? Clerk.useUser()
  : { isLoaded: true, isSignedIn: false, user: null };
export function ClerkProvider(props: ComponentProps<typeof Clerk.ClerkProvider>) {
  return hosted ? <Clerk.ClerkProvider {...props} /> : <>{props.children}</>;
}
export function SignedIn({ children }: PropsWithChildren) {
  return hosted ? <Clerk.SignedIn>{children}</Clerk.SignedIn> : null;
}
export function SignedOut({ children }: PropsWithChildren) {
  return hosted ? <Clerk.SignedOut>{children}</Clerk.SignedOut> : <>{children}</>;
}
export const SignIn = Clerk.SignIn;
export const AuthenticateWithRedirectCallback = Clerk.AuthenticateWithRedirectCallback;
