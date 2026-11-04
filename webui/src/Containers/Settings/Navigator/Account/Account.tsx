import { FC } from "react";
import styled from "@emotion/styled";
import { Input } from "baseui/input";
import { Github } from "@styled-icons/bootstrap";
import styles from "./styles";

const Title = styled.div`
  font-size: 18px;
  font-weight: 500;
  margin: 0;
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 18px;
  justify-content: center;
`;

const Label = styled.div`
  display: flex;
  flex-direction: row;
  margin-bottom: 8px;
  font-size: 14px;
`;

const Flex = styled.div`
  display: flex;
  flex-direction: column;
`;

const Muted = styled.div`
  color: #736f86;
  font-size: 13px;
  margin-top: 8px;
`;

const Row = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 32px;
`;

const Subtitle = styled.div`
  margin-top: 6px;
  color: #736f86;
`;

const GithubLink = styled.a`
  display: flex;
  flex-direction: row;
  margin-top: 8px;
  margin-left: 10px;
  align-items: center;
  justify-content: center;
  border: 1px solid #877eb186;
  height: 30px;
  border-radius: 15px;
  padding-left: 12px;
  padding-right: 12px;
  color: #000;
  &:hover {
    color: #000;
    opacity: 0.8;
  }
`;

export type AccountProps = {
  username: string;
  email: string;
  displayName: string;
};

const Account: FC<AccountProps> = (props) => {
  const { username, email, displayName } = props;
  return (
    <>
      <Title>Account Information</Title>
      {username && (
        <Row>
          <Subtitle>{displayName}</Subtitle>
          <GithubLink href={`https://github.com/${username}`} target="_blank">
            <Github size={16} style={{ marginRight: 8, color: "#fff" }} />
            <div style={{ fontSize: 14, color: "#fff" }}>{username}</div>
          </GithubLink>
        </Row>
      )}
      <Column>
        <Label>Username</Label>
        <Flex>
          <Input value={username} overrides={styles.Input} disabled />
        </Flex>
      </Column>
      <Column>
        <Label>Email</Label>
        <Flex>
          <Input value={email} overrides={styles.Input} disabled />
          <Muted>Email address is managed by GitHub</Muted>
        </Flex>
      </Column>
    </>
  );
};

export default Account;
