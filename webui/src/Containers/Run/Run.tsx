import { FC, useState } from "react";
import { Accordion, Panel } from "baseui/accordion";
import Header from "../../Components/Header";
import { CheckCircle } from "@styled-icons/boxicons-solid";
import styles, {
  Action,
  Container,
  Loader,
  Status,
  Title,
  Wrapper,
  FullscreenButton,
} from "./styles";
import { ChevronRight, ChevronDown } from "@styled-icons/boxicons-solid";
import _ from "lodash";
import LogsViewer from "../../Components/LogsViewer/LogsViewer";
import { Spinner } from "baseui/spinner";
import { Fullscreen, FullscreenExit } from "@styled-icons/bootstrap";
import { Modal, ModalHeader, SIZE } from "baseui/modal";
import { CloseCircle } from "@styled-icons/ionicons-sharp";
import Duration from "../../Components/Duration";
import Titlebar from "../../Components/Titlebar";
import Navbar from "../../Components/Navbar";
import AskAI from "../../Components/AskAI";

export type RunProps = {
  actions: {
    id: string;
    name: string;
    startedAt?: string | null;
    duration?: number | null;
    status: "SUCCESS" | "FAILURE" | "RUNNING" | "PENDING";
    logs?: string[];
  }[];
};

const Run: FC<RunProps> = (props) => {
  const { actions } = props;
  const [clickedActionIndex, setClickedActionIndex] = useState<number | null>(
    null
  );
  const [isOpen, setIsOpen] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<string | null>(null);
  return (
    <>
      <Titlebar />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Navbar />
      </div>
      <Wrapper>
        <Container>
          <Header />
          <Accordion
            onChange={({ expanded }) => {
              setExpandedIndex(_.get(expanded, "0", null) as string | null);
            }}
            accordion
            overrides={styles.Accordion}
          >
            {actions.map((item, key) => (
              <Panel
                disabled={item.status === "PENDING"}
                key={key}
                title={
                  <Action disabled={item.status === "PENDING"}>
                    <Status>
                      {key.toString() != expandedIndex! && (
                        <ChevronRight size={24} />
                      )}
                      {key.toString() == expandedIndex! && (
                        <ChevronDown size={24} />
                      )}
                    </Status>
                    <Loader>
                      {item.status == "SUCCESS" && (
                        <CheckCircle size={"24px"} color="#24ffa0" />
                      )}
                      {item.status === "FAILURE" && (
                        <div style={{ marginRight: 15 }}>
                          <CloseCircle size={"24px"} color="#ff246d" />
                        </div>
                      )}
                      {item.status == "RUNNING" && (
                        <Spinner
                          $size={"15px"}
                          $borderWidth={"3px"}
                          style={{
                            borderRightColor: "#ffffff22",
                            borderLeftColor: "#ffffff22",
                            borderTopColor: "#ffffff22",
                            borderBottomColor: "#24ffd7",
                          }}
                        />
                      )}
                    </Loader>
                    <Title>{item.name}</Title>
                    {item.status === "RUNNING" && (
                      <Duration startDate={item.startedAt} />
                    )}
                    {item.status !== "RUNNING" && (
                      <Duration value={item.duration} />
                    )}
                  </Action>
                }
              >
                <div style={{ position: "relative" }}>
                  <FullscreenButton
                    onClick={() => {
                      setClickedActionIndex(key);
                      setIsOpen(true);
                    }}
                  >
                    <Fullscreen size={15} color="#fff" />
                  </FullscreenButton>
                  <LogsViewer
                    logs={item.logs || []}
                    updatedLogs={item.logs || []}
                  />
                </div>
              </Panel>
            ))}
          </Accordion>
          <Modal
            onClose={() => setIsOpen(false)}
            closeable
            isOpen={isOpen}
            animate
            autoFocus
            size={SIZE.full}
            overrides={styles.Modal}
          >
            <ModalHeader>
              <FullscreenButton
                onClick={() => setIsOpen(false)}
                style={{ marginRight: 15 }}
              >
                <FullscreenExit size={15} color="#fff" />
              </FullscreenButton>
            </ModalHeader>
            <LogsViewer
              height="calc(100vh - 36px)"
              logs={
                clickedActionIndex !== null
                  ? actions[clickedActionIndex].logs || []
                  : []
              }
              updatedLogs={
                clickedActionIndex !== null
                  ? actions[clickedActionIndex].logs
                  : []
              }
            />
          </Modal>
          <AskAI />
        </Container>
      </Wrapper>
    </>
  );
};

export default Run;
