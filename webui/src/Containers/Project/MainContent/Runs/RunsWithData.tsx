/* eslint-disable react-hooks/exhaustive-deps */
import { FC, useEffect } from "react";
import Runs from "./Runs";
import { useCountRunsQuery, useGetRunsQuery } from "../../../../Hooks/GraphQL";
import { useParams } from "react-router-dom";
import useWebSocket from "react-use-websocket";
import { useRecoilState, useRecoilValue } from "recoil";
import { PaginationState } from "./PaginationState";
import { AuthState } from "../../../Auth/AuthState";

const WS_URL = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;

const RunsWithData: FC = () => {
  const { id } = useParams();
  const me = useRecoilValue(AuthState);
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
  const [pagination, setPagination] = useRecoilState(PaginationState);
  const { data: countRunsData, refetch: refetchCount } = useCountRunsQuery({
    variables: {
      projectId: id!,
    },
  });
  const { data, refetch, loading } = useGetRunsQuery({
    variables: {
      projectId: id!,
      skip: (pagination.currentPage - 1) * pagination.limit,
      limit: pagination.limit,
    },
  });

  const setCurrentPage = (page: number) => {
    setPagination((prev) => ({
      ...prev,
      currentPage: page,
    }));
  };

  useEffect(() => {
    if (countRunsData) {
      setPagination((prev) => ({
        ...prev,
        numPages: Math.ceil(countRunsData.countRuns / pagination.limit),
      }));
    }
  }, [countRunsData]);

  useEffect(() => {
    refetch();
    refetchCount();
  }, []);

  useEffect(() => {
    if (lastJsonMessage?.channel === "run") {
      refetch();
      refetchCount();
    }
  }, [lastJsonMessage]);

  return (
    <Runs
      data={data?.getRuns || []}
      pagination={pagination}
      setCurrentPage={setCurrentPage}
      loading={loading}
      total={countRunsData?.countRuns || 0}
    />
  );
};

export default RunsWithData;
