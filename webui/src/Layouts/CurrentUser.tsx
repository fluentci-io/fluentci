import { FC, ReactNode, useEffect } from "react";
import { useGetMeLazyQuery } from "../Hooks/GraphQL";
import { useRecoilState } from "recoil";
import { AuthState } from "../Containers/Auth/AuthState";
import { hosted, useAuth } from "../lib/auth";

const CurrentUserLayout: FC<{
  children: ReactNode;
}> = ({ children }) => {
  const { isLoaded } = useAuth();
  const [getMe] = useGetMeLazyQuery();
  const setMe = useRecoilState(AuthState)[1];

  useEffect(() => {
    if (!hosted || !isLoaded) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getMe().then((response: any) => setMe(response?.data?.me));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  return <>{children}</>;
};

export default CurrentUserLayout;
