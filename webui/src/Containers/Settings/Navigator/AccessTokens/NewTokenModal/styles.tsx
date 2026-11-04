import { css } from "@emotion/react";
import styled from "@emotion/styled";

export const Button = styled.button<{ inverted?: boolean }>`
  height: 40px;
  background-color: #24ffb5;
  color: #000;
  border: none;
  font-weight: 600;
  width: 150px;
  cursor: pointer;
  font-family: Lexend;
  ${(props) =>
    props.inverted &&
    css`
      background-color: transparent;
      color: #24ffb5;
    `}
  &:hover {
    ${(props) =>
      !props.inverted &&
      css`
        background-color: #18d193;
      `}
  }
`;

export const Label = styled.label`
  font-family: "Lexend";
`;

export const ModalTitle = styled.h2`
  font-family: Lexend;
  font-size: 16px;
  font-weight: 600;
  margin: 0;
`;

export default {
  Modal: {
    Dialog: {
      style: {
        backgroundColor: "#0f0124",
        fontFamily: "Lexend",
      },
    },
  },
  Input: {
    Root: {
      style: {
        marginTop: "8px",
        border: "1px solid #24ffb5",
      },
    },
    Input: {
      style: {
        fontFamily: "Lexend",
      },
    },
  },
};
