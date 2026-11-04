import { FC, useState } from "react";
import { Notification, KIND } from "baseui/notification";
import {
  StyledTable,
  StyledHead,
  StyledHeadCell,
  StyledBody,
  StyledRow,
  StyledCell,
} from "baseui/table";
import { Check2Circle } from "@styled-icons/bootstrap";
import { Warning } from "@styled-icons/ionicons-outline";
import { Copy } from "@styled-icons/ionicons-outline";
import copy from "copy-to-clipboard";
import { Delete } from "@styled-icons/material-outlined";
import dayjs from "dayjs";
import NewTokenModal from "./NewTokenModal";
import DeleteTokenModal from "./DeleteTokenModal";
import {
  Header,
  PageTitle,
  NotificationBody,
  Code,
  CopyButton,
  DeleteButton,
  GenerateAccessTokenButton,
} from "./styles";

export type AccessTokensProps = {
  onGenerateAccessToken: (name: string) => Promise<string | undefined>;
  onDeleteAccessToken: (id: string) => Promise<void>;
  tokens: { id: string; name: string; token: string; created: string }[];
};

const AccessTokens: FC<AccessTokensProps> = (props) => {
  const [newToken, setNewToken] = useState<string | undefined>(undefined);
  const { onGenerateAccessToken, onDeleteAccessToken, tokens } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState<{
    id: string;
    name: string;
    token: string;
  } | null>(null);

  const close = () => {
    setIsOpen(false);
  };

  return (
    <>
      <DeleteTokenModal
        isOpen={isDeleteModalOpen}
        close={() => setIsDeleteModalOpen(false)}
        token={tokenToDelete}
        onDeleteToken={async () => {
          if (!tokenToDelete) {
            return;
          }
          onDeleteAccessToken(tokenToDelete.id).catch((e) => {
            console.error(e);
          });
          setIsDeleteModalOpen(false);
          setTokenToDelete(null);
        }}
      />
      <NewTokenModal
        isOpen={isOpen}
        close={close}
        onGenerateAccessToken={onGenerateAccessToken}
        setNewToken={setNewToken}
      />
      <Header>
        <PageTitle>Access Tokens</PageTitle>
        <GenerateAccessTokenButton onClick={() => setIsOpen(true)}>
          Generate new Token
        </GenerateAccessTokenButton>
      </Header>
      <div>
        <Notification
          kind={KIND.warning}
          overrides={{
            Body: {
              style: {
                minWidth: "calc(100% - 32px)",
                marginLeft: 0,
                marginRight: 0,
                marginBottom: "25px",
              },
            },
          }}
        >
          <NotificationBody>
            <Warning size="27" color="#ff8c00" style={{ marginTop: 2 }} />
            <div
              style={{ color: "orange", marginLeft: 16, fontFamily: "Lexend" }}
            >
              Personal access tokens can be used to control your whole account
              and use features added in the future. Be careful when sharing
              them!
            </div>
          </NotificationBody>
        </Notification>
        {newToken && (
          <Notification
            kind={KIND.positive}
            overrides={{
              Body: {
                style: {
                  minWidth: "calc(100% - 32px)",
                  marginLeft: 0,
                  marginRight: 0,
                  marginBottom: "25px",
                  minHeight: "108px",
                },
              },
              InnerContainer: {
                style: {
                  width: "100%",
                },
              },
            }}
          >
            <NotificationBody>
              <Check2Circle
                size="24"
                color="#22bf22"
                style={{ marginTop: 2 }}
              />
              <div
                style={{
                  marginBottom: 23,
                  color: "#22bf22",
                  marginLeft: 16,
                  fontFamily: "Lexend",
                }}
              >
                Successfully generated a new token!
                <br />
                Do copy this access token and store it in a secure place - you
                will not be able to see it again.
              </div>
            </NotificationBody>
            <Code>
              <span
                style={{
                  textOverflow: "ellipsis",
                  overflowY: "hidden",
                  display: "block",
                  whiteSpace: "nowrap",
                  color: "#0f0124",
                }}
              >
                {newToken}
              </span>
              <CopyButton onClick={() => copy(newToken)}>
                <Copy size="20" color="#0f0124" />
              </CopyButton>
            </Code>
          </Notification>
        )}
        {tokens.length > 0 && (
          <StyledTable>
            <StyledHead>
              <StyledHeadCell style={{ fontFamily: "Lexend" }}>
                Token
              </StyledHeadCell>
              <StyledHeadCell style={{ fontFamily: "Lexend" }}>
                Name
              </StyledHeadCell>
              <StyledHeadCell style={{ fontFamily: "Lexend" }}>
                Created
              </StyledHeadCell>
            </StyledHead>
            <StyledBody>
              {tokens.map((token) => (
                <StyledRow key={token.name}>
                  <StyledCell style={{ fontFamily: "Lexend" }}>
                    {token.token}
                  </StyledCell>
                  <StyledCell style={{ fontFamily: "Lexend" }}>
                    {token.name}
                  </StyledCell>
                  <StyledCell>
                    <StyledCell style={{ fontFamily: "Lexend" }}>
                      {dayjs(token.created).format("MM/DD/YYYY, h:mm A")}
                    </StyledCell>
                    <StyledCell style={{ flex: 0.2 }}>
                      <DeleteButton
                        style={{ backgroundColor: "initial" }}
                        onClick={() => {
                          setTokenToDelete(token);
                          setIsDeleteModalOpen(true);
                        }}
                      >
                        <Delete size="18" color="#fff" />
                      </DeleteButton>
                    </StyledCell>
                  </StyledCell>
                </StyledRow>
              ))}
            </StyledBody>
          </StyledTable>
        )}
      </div>
    </>
  );
};

export default AccessTokens;
