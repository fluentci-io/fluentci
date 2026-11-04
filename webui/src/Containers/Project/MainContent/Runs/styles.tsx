import styled from "@emotion/styled";
import { css } from "@emotion/react";

type Theme = { primaryFontFamily: string };

export const RunItem = styled.div<{ showBorder?: boolean }>`
  color: #fff;
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 80px;
  cursor: pointer;
  ${(props) =>
    props.showBorder
      ? css`
          border-bottom: 1px solid #1b0657;
        `
      : ""};
`;

export const Branch = styled.span`
  font-size: 14px;
  color: #00e3f9;
  background-color: #00e3f92e;
  padding: 5px;
  border-radius: 5px;
  &:hover {
    border: 1px solid #00e3f9;
  }
`;

export const Title = styled.div`
  flex: 1;
  color: #ffffffbf;
  font-size: 14px;
`;

export default {
  Pagination: {
    Root: {
      style: {
        justifyContent: "center",
      },
    },
    NextButton: {
      style: ({ $theme }: { $theme: Theme }) => ({
        outline: "none",
        backgroundColor: "initial !important",
        fontFamily: $theme.primaryFontFamily,
        ":hover": {
          color: "#24ffb5",
        },
        ":disabled": {
          color: "#f9f9f954",
        },
      }),
    },
    PrevButton: {
      style: ({ $theme }: { $theme: Theme }) => ({
        outline: "none",
        backgroundColor: "initial !important",
        fontFamily: $theme.primaryFontFamily,
        ":hover": {
          color: "#24ffb5",
        },
        ":disabled": {
          color: "#f9f9f954",
        },
      }),
    },
    MaxLabel: {
      style: ({ $theme }: { $theme: Theme }) => ({
        fontFamily: $theme.primaryFontFamily,
      }),
    },
    DropdownContainer: {
      style: {
        outline: "none",
      },
    },
    Select: {
      props: {
        overrides: {
          ControlContainer: {
            style: {
              backgroundColor: "initial !important",
            },
          },
          OptionContent: {
            style: ({ $theme }: { $theme: Theme }) => ({
              fontFamily: $theme.primaryFontFamily,
            }),
          },
          SingleValue: {
            style: ({ $theme }: { $theme: Theme }) => ({
              fontFamily: $theme.primaryFontFamily,
            }),
          },
        },
      },
    },
  },
};
