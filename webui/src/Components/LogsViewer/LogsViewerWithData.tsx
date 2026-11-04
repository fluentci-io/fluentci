import { FC } from "react";
import LogsViewer from "./LogsViewer";
import { logs } from "./mocks";

export type LogsViewerWithDataProps = {
  height?: string;
};

const LogsViewerWithData: FC<LogsViewerWithDataProps> = (props) => {
  return <LogsViewer {...props} logs={logs.split("\n")} />;
};

export default LogsViewerWithData;
