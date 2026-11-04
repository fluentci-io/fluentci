/* eslint-disable @typescript-eslint/no-explicit-any */
import { FC } from "react";
import { Maximize } from "@styled-icons/fluentui-system-filled";
import { WindowMinimize } from "@styled-icons/fa-solid";
import { Close } from "@styled-icons/ionicons-solid";
import { Button, Container, Controls } from "./styles";

const Titlebar: FC = () => {
  const onMinimize = () => {
    (window as any).electron.send("window-control", "minimize");
  };

  const onMaximize = () => {
    (window as any).electron.send("window-control", "maximize");
  };

  const onClose = () => {
    (window as any).electron.send("window-control", "close");
  };

  return (
    <>
      {!location.host && (
        <Container>
          <Controls>
            <Button onClick={onMinimize}>
              <WindowMinimize size={18} color="#fff" />
            </Button>
            <Button onClick={onMaximize} style={{ paddingLeft: 5 }}>
              <Maximize size={20} color="#fff" />
            </Button>
            <Button onClick={onClose}>
              <Close size={24} color="#fff" />
            </Button>
          </Controls>
        </Container>
      )}
    </>
  );
};

export default Titlebar;
