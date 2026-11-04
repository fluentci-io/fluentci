import { FC, useEffect, useState } from "react";
import MainContent from "./MainContent";
import {
  Account,
  // useCreateProjectMutation,
  useGetAccountLazyQuery,
  useGetProjectsQuery,
} from "../../../Hooks/GraphQL";
import useWebSocket from "react-use-websocket";
import { useNavigate, useParams } from "react-router-dom";
import { useRecoilValue } from "recoil";
import { AuthState } from "../../Auth/AuthState";

const WS_URL = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;

const MainContentWithData: FC = () => {
  const navigate = useNavigate();
  const { id: usernameOrOrg } = useParams();
  const me = useRecoilValue(AuthState);
  const [account, setAccount] = useState<Account | undefined | null>(null);
  const [getAccount] = useGetAccountLazyQuery();
  const { lastJsonMessage } = useWebSocket<{
    channel: string;
    data: Record<string, unknown>;
  }>(me ? `wss://events.fluentci.io?s=${me.id}` : WS_URL, {
    share: true,
    shouldReconnect: () => true,
    heartbeat: {
      interval: 30000,
    },
  });

  const { data, refetch, loading } = useGetProjectsQuery({
    variables: {
      filters: usernameOrOrg
        ? {
            user: usernameOrOrg,
          }
        : undefined,
      reverse: true,
    },
  });

  const onNewProject = async () => {
    navigate("/new-project");
  };

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastJsonMessage]);

  useEffect(() => {
    if (usernameOrOrg) {
      getAccount({
        variables: {
          github: usernameOrOrg,
        },
      }).then((res) => {
        if (!res.data?.account) {
          navigate("/");
          return;
        }
        setAccount(res.data?.account);
      });
      return;
    }
    setAccount(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAccount, usernameOrOrg]);

  return (
    <MainContent
      projects={data?.projects}
      onNewProject={onNewProject}
      displayNewProjectButton={
        (!import.meta.env.VITE_APP_API_URL?.includes("api.fluentci.io") &&
          location.hostname !== "app.fluentci.io") ||
        (me?.github === usernameOrOrg && !!usernameOrOrg) ||
        (!!me && !usernameOrOrg)
      }
      profile={account}
      loading={loading}
    />
  );
};

export default MainContentWithData;
