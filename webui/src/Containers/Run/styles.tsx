import { css } from "@emotion/react";
import styled from "@emotion/styled";

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  width: 80vw;
  margin: 0 auto;
  margin-top: 60px;
`;

export const Wrapper = styled.div`
  height: calc(100vh - 30px);
  display: flex;
  flex-direction: row;
  overflow-y: auto;
`;

export const Action = styled.div<{ disabled?: boolean }>`
  display: flex;
  flex-direction: row;
  align-items: center;
  flex: 1;
  ${(props) =>
    props.disabled &&
    css`
      opacity: 0.5;
    `}
`;

export const Title = styled.div`
  flex: 1;
  display: flex;
`;

export const Status = styled.div`
  width: 20px;
  margin-right: 15px;
`;

export const Loader = styled.div`
  width: 24px;
  margin-right: 15px;
`;

export default {
  Accordion: {
    Header: {
      style: {
        backgroundColor: "#0f0124",
        fontFamily: "Lexend",
        height: "40px",
      },
    },
    ToggleIcon: {
      style: {
        display: "none",
      },
    },
    Content: {
      style: {
        backgroundColor: "#0f0124",
        fontFamily: "Lexend",
      },
    },
  },
  Modal: {
    Root: {
      style: {
        margin: "0px",
      },
    },
    Dialog: {
      style: ({ $theme }: { $theme: { primaryFontFamily: string } }) => ({
        backgroundColor: "#0f0124",
        color: "#fff",
        fontFamily: $theme.primaryFontFamily,
        margin: "0px !important",
      }),
    },
    DialogContainer: {
      style: {
        margin: "0px !important",
      },
    },
    Close: {
      style: {
        display: "none",
      },
    },
  },
};

export const FullscreenButton = styled.button`
  position: absolute;
  right: 0;
  margin-right: 10px;
  background-color: initial;
  border: 1px solid #ffffff2e;
  cursor: pointer;
  border-radius: 7px;
  padding: 10px;
`;
