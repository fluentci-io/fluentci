import { FC, useEffect } from "react";
import Navbar from "./Navbar";
import { useNavigate } from "react-router-dom";
import { useRecoilState, useRecoilValue } from "recoil";
import { AuthState } from "../../Containers/Auth/AuthState";
import { useAuth, useUser } from "../../lib/auth";

const NavbarWithData: FC = () => {
  const { getToken, isSignedIn, signOut } = useAuth();
  const setMe = useRecoilState(AuthState)[1];
  const { user } = useUser();
  const me = useRecoilValue(AuthState);
  const navigate = useNavigate();

  const onSignOut = async () => {
    await signOut();
    localStorage.setItem("logout", "true");
    localStorage.removeItem("token");
    setMe(null);
  };

  useEffect(() => {
    if (localStorage.getItem("logout") === "true") {
      localStorage.removeItem("logout");
      return;
    }

    if (isSignedIn === false /*&& location.host === "app.fluentci.io"*/) {
      if (
        location.pathname.startsWith("/settings") ||
        location.pathname.startsWith("/link-project")
      ) {
        navigate("/auth");
      }
      return;
    }
    getToken().then((token) => {
      localStorage.setItem("token", token!);
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  return (
    <Navbar
      user={user}
      onSignOut={onSignOut}
      showAccountMenu={!!me}
      showSignInButton={
        import.meta.env.VITE_APP_API_URL?.includes("api.fluentci.io") ||
        location.hostname === "app.fluentci.io"
      }
    />
  );
};

export default NavbarWithData;
