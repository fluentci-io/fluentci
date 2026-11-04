import { css } from "@emotion/react";
import styled from "@emotion/styled";

export const Container = styled.div`
  position: absolute;
  right: 0;
  top: 20px;
`;

export const Button = styled.button<{ active?: boolean }>`
  height: 40px;
  width: 40px;
  cursor: pointer;
  background-color: initial;
  border: none;
  opacity: 0.6;
  ${({ active }) =>
    active &&
    css`
      border-bottom: 2px solid #24ffb5;
      opacity: 1;
    `}
`;
