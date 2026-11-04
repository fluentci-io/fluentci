import { FC, useEffect } from "react";
import { Tabs, Tab, ORIENTATION } from "baseui/tabs-motion";
import Navbar from "../../../Components/Navbar";
import styled from "@emotion/styled";
import { useNavigate } from "react-router-dom";
import Billing from "./Billing";
import Account from "./Account";
import AccessTokens from "./AccessTokens";
import Titlebar from "../../../Components/Titlebar";
import AskAI from "../../../Components/AskAI";
import styles from "./styles";

const Title = styled.h1`
  font-size: 21px;
  font-weight: 600;
  margin-top: 32px;
  margin-bottom: 32px;
`;

const Container = styled.div`
  width: 80vw;
  margin: 0 auto;
`;

const TabContainer = styled.div`
  padding-left: 32px;
  padding-right: 32px;
`;

export type NavigatorProps = {
  activeKey: React.Key;
  setActiveKey: (activeKey: React.Key) => void;
};

const routes: Record<number, string> = {
  0: "/settings/account",
  1: "/settings/billing",
  2: "/settings/tokens",
};

const Navigator: FC<NavigatorProps> = ({ activeKey, setActiveKey }) => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(routes[activeKey as number]);
  }, [activeKey, navigate]);

  return (
    <div style={{ height: "100vh", overflowY: "auto" }}>
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
      <Container>
        <Title>Settings</Title>
        <Tabs
          activeKey={activeKey}
          onChange={({ activeKey }) => setActiveKey(activeKey)}
          orientation={ORIENTATION.vertical}
          overrides={styles.Tabs}
        >
          <Tab title="Account" overrides={styles.Tab}>
            <TabContainer>
              <Account />
            </TabContainer>
          </Tab>
          <Tab title="Billing" overrides={styles.Tab}>
            <TabContainer>
              <Billing />
            </TabContainer>
          </Tab>
          <Tab title="Access Tokens" overrides={styles.Tab}>
            <TabContainer>
              <AccessTokens />
            </TabContainer>
          </Tab>
        </Tabs>
        <AskAI />
      </Container>
    </div>
  );
};

Navigator.defaultProps = {
  activeKey: 0,
  setActiveKey: () => {},
};

export default Navigator;
