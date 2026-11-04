import styled from "@emotion/styled";

export const Header = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
`;

export const PageTitle = styled.h1`
  font-size: 18px;
  font-weight: 500;
  margin: 0;
`;

export const Code = styled.code`
  background-color: #4ed89f;
  color: #fff;
  padding: 10px;
  border-radius: 4px;
  width: calc(100% - 20px);
  display: flex;
  overflow-x: hidden;
`;

export const CopyButton = styled.button`
  margin-left: 32px;
  background-color: transparent;
  border: none;
  cursor: pointer;
  &:hover {
    opacity: 0.8;
  }
`;

export const NotificationBody = styled.div`
  display: flex;
  flex-direction: row;
  width: 100%;
`;

export const DeleteButton = styled.button`
  cursor: pointer;
  background-color: #e4e4e45d;
  border: none;
  border-radius: 4px;
`;

export const GenerateAccessTokenButton = styled.button`
  height: 40px;
  background-color: #24ffb5;
  color: #000;
  border: none;
  font-weight: 600;
  width: 180px;
  cursor: pointer;
  font-family: Lexend;
  &:hover {
    background-color: #18d193;
  }
`;
