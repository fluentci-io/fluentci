import { FC, useEffect, useState } from "react";
import Run from "./Run";
import { useParams } from "react-router-dom";
import { useGetRunQuery } from "../../Hooks/GraphQL";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import useWebSocket from "react-use-websocket";
import _ from "lodash";
import { useRecoilValue } from "recoil";
import { AuthState } from "../Auth/AuthState";

dayjs.extend(duration);

const WS_URL = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;

const RunWithData: FC = () => {
  const { id } = useParams();
  const me = useRecoilValue(AuthState);
  const [actions, setActions] = useState<
    {
      id: string;
      name: string;
      startedAt?: string | null;
      duration?: number | null;
      status: "SUCCESS" | "FAILURE" | "RUNNING" | "PENDING";
      logs?: string[];
    }[]
  >([]);
  const { data, refetch } = useGetRunQuery({
    variables: {
      id: id!,
    },
    fetchPolicy: "cache-and-network",
  });
  const { lastJsonMessage } = useWebSocket<{
    channel: string;
    data: {
      id: string;
      name: string;
      status: string;
      duration: number;
      logs: { message: string }[];
      startedAt?: string;
      text: string;
      jobId: string;
    };
  }>(me ? `wss://events.fluentci.io?s=${me.id}` : WS_URL, {
    share: true,
    shouldReconnect: () => true,
    heartbeat: { interval: 30000 },
  });

  useEffect(() => {
    setActions(
      data?.getRun?.jobs?.map((x) => ({
        id: x.id,
        name: x.name,
        status: x.status as "RUNNING" | "SUCCESS" | "FAILURE" | "PENDING",
        duration: x.duration,
        logs: x.logs?.map((y) => y.message.split("\n")).flat(),
        startedAt: x.startedAt,
      })) || []
    );
  }, [data]);

  useEffect(() => {
    const update = async () => {
      if (lastJsonMessage?.channel === "logs") {
        const index = _.findIndex(actions, { id: lastJsonMessage.data.jobId });
        const _actions = [...actions];
        _actions[index] = {
          ..._actions[index],
          logs: (_actions[index].logs || []).concat(
            lastJsonMessage?.data.text?.split("\n")
          ),
        };
        setActions(_actions);
      }

      if (lastJsonMessage?.channel === "job") {
        const response = await refetch({ id: id! });

        const _actions =
          response.data?.getRun?.jobs?.map((x) => ({
            id: x.id,
            name: x.name,
            status: x.status as "RUNNING" | "SUCCESS" | "FAILURE" | "PENDING",
            duration: x.duration,
            logs: x.logs?.map((y) => y.message.split("\n")).flat(),
            startedAt: lastJsonMessage.data.startedAt,
          })) || [];

        const index = _.findIndex(_actions, { id: lastJsonMessage.data.id });

        if (index == -1) {
          return;
        }

        _actions[index] = {
          id: lastJsonMessage.data.id,
          name: lastJsonMessage.data.name,
          status: lastJsonMessage.data.status as
            | "RUNNING"
            | "SUCCESS"
            | "FAILURE"
            | "PENDING",
          duration: lastJsonMessage.data.duration,
          logs: lastJsonMessage.data.logs
            ?.map((y) => y.message.split("\n"))
            .flat(),
          startedAt: lastJsonMessage.data.startedAt,
        };
        setActions(_actions);
      }
    };

    if (lastJsonMessage?.channel === "run") {
      refetch();
    }

    update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastJsonMessage, id]);

  return <Run actions={actions} />;
};

export default RunWithData;
