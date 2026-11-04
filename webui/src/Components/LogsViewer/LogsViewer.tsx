import { FC, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import "@fontsource/inconsolata";
import Ansi from "ansi-to-react";

const Container = styled.div<{ height?: string }>`
  height: calc(100vh - 125px);
  overflow: auto;
  ${(props) => props.height && `height: ${props.height};`}
`;

const Line = styled.div`
  line-height: 20px;
  color: #d5dbe2;
`;

const LineNumber = styled.span`
  min-width: 50px;
  text-align: right;
  padding-right: 10px;
  color: #a8adb3;
  -webkit-user-select: none; /* Safari */
  -ms-user-select: none; /* IE 10 and IE 11 */
  user-select: none; /* Standard syntax */
`;

const Row = styled.div`
  font-size: 14px;
  display: flex;
  flex-direction: row;
  font-family: "Inconsolata", monospace;
  color: #d5dbe2;
  &:hover {
    background-color: #160231;
  }
`;

export type LogsViewerProps = {
  logs: string[];
  updatedLogs?: string[];
  height?: string;
};

const LogsViewer: FC<LogsViewerProps> = (props) => {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const { logs, updatedLogs } = props;

  useEffect(() => {
    // Scroll to the bottom whenever logs change
    if (logContainerRef.current && (updatedLogs?.length || 0) > 0) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [updatedLogs]);

  return (
    <Container ref={logContainerRef} height={props.height}>
      {logs
        .filter((x) => x.trim().length)
        .map((log, index) => (
          <Row key={index}>
            <LineNumber>{index + 1}</LineNumber>
            <Line>
              <Ansi>{log}</Ansi>
            </Line>
          </Row>
        ))}
    </Container>
  );
};

LogsViewer.defaultProps = {
  updatedLogs: [],
};

export default LogsViewer;
