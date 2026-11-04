import styled from "@emotion/styled";

export const Container = styled.div`
  display: flex;
  flex-direction: row;
  height: 30px;
  align-items: center;
  justify-content: flex-end;
  -webkit-app-region: drag;
`;

export const Button = styled.button`
  background-color: initial;
  border: none;
  cursor: pointer;
  padding: 0;
`;

export const Controls = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  width: 84px;
  -webkit-app-region: no-drag;
`;
