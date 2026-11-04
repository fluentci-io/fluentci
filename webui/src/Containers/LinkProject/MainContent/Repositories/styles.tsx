import { css } from "@emotion/react";
import styled from "@emotion/styled";

export const Tag = styled.div<{ alt?: boolean }>`
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-left: 15px;
  font-size: 12px;
  color: #00e3f9;
  background-color: #00e3f92e;
  padding: 3px;
  padding-right: 10px;
  padding-left: 8px;
  border-radius: 20px;
  ${(props) =>
    props.alt &&
    css`
      color: #f900ae;
      background-color: #f900ae1f;
    `}
`;

export const RepoLink = styled.a`
  color: #fff;
  &:hover {
    text-decoration: underline;
  }
`;

export const Button = styled.button`
  cursor: pointer;
  font-weight: 600;
  background-color: #5a00e1;
  color: #fff;
  font-family: Lexend;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  width: 120px;
  border-radius: 3px;
`;

export const RepoRow = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 60px;
`;

export default {
  Input: {
    Root: {
      style: {
        borderRadius: "30px",
        backgroundColor: "#12002db3",
        border: "1px solid rgba(255, 255, 255, 0.12)",
      },
    },
    InputContainer: {
      style: {
        backgroundColor: "#12002db3",
      },
    },
    Input: {
      style: {
        backgroundColor: "#12002db3",
        fontFamily: "Lexend",
      },
    },
    StartEnhancer: {
      style: {
        backgroundColor: "#12002db3",
      },
    },
  },
};
