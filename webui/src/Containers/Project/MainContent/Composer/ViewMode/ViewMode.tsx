import { FC } from "react";
import { Button, Container } from "./styles";
import { ViewStacked, Code } from "@styled-icons/bootstrap";

export type ViewModeProps = {
  mode: "stacked" | "code";
  onSetViewMode: (viewMode: "stacked" | "code") => void;
};

const ViewMode: FC<ViewModeProps> = (props) => {
  const { mode, onSetViewMode } = props;
  return (
    <Container>
      <Button
        active={mode === "stacked"}
        onClick={() => onSetViewMode("stacked")}
      >
        <ViewStacked size={15} color="#fff" />
      </Button>
      <Button active={mode === "code"} onClick={() => onSetViewMode("code")}>
        <Code size={21} color="#fff" />
      </Button>
    </Container>
  );
};

export default ViewMode;
