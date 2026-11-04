import { FC } from "react";
import { Container, Text, Clipboard } from "./styles";
import { Account, Project, Repository } from "../../../../../Hooks/GraphQL";
import { Terminal } from "@styled-icons/bootstrap";
import { Copy } from "@styled-icons/ionicons-outline";
import copyToClipboard from "copy-to-clipboard";
import LinkRepo from "./LinkRepo";

export type PlaceholderProps = {
  data?: Project | null;
  me?: Account | null;
  linkedRepository?: Repository | null;
};

const Placeholder: FC<PlaceholderProps> = (props) => {
  const command =
    location.host === "app.fluentci.io"
      ? `FLUENTCI_PROJECT_ID=${props.data?.name} fluentci run --remote-exec .`
      : `FLUENTCI_PROJECT_ID=${props.data?.name} fluentci run .`;
  return (
    <Container>
      {(props.data?.path !== "empty" || !!props.linkedRepository) && (
        <>
          <div style={{ marginTop: 20 }}>
            <Text>THERE'S NOTHING HERE YET BUT THAT'S OKAY</Text>
          </div>

          <p>Once available, the timeline of pipeline runs will appear here</p>
        </>
      )}
      {props.data?.path === "empty" && !props.linkedRepository && (
        <>
          <div style={{ display: "flex", padding: 20 }}>
            <div style={{ marginRight: 20 }}>
              <Terminal size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>
                Finish setting up your project
              </div>
              <div style={{ fontSize: 14, color: "#7392b1" }}>
                Run the following command in your project directory to finish
                project setup :
                <br />
                <br />
              </div>
              <code
                style={{
                  padding: 10,
                  backgroundColor: "#190832",
                  borderRadius: 3,
                }}
              >
                <span>{command}</span>
                <Clipboard onClick={() => copyToClipboard(command)}>
                  <Copy size={20} color="#fff" />
                </Clipboard>
              </code>
            </div>
          </div>
          {!!props.me && <LinkRepo />}
        </>
      )}
    </Container>
  );
};

export default Placeholder;
