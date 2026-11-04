import styled from "@emotion/styled";
import { Link as DefaultLink } from "react-router-dom";

export const Link = styled(DefaultLink)`
  color: #fff;
  &:hover {
    color: #24ffb5 !important;
  }
`;

export const Title = styled.div`
  font-size: 25px;
  margin-bottom: 20px;
  font-weight: 500;
  flex: 1;
`;

export const Container = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  height: 40px;
  margin-bottom: 20px;
`;

export const RunButton = styled.button<{ disabled?: boolean }>`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 40px;
  background-color: #24ffb5;
  color: #000;
  border: none;
  font-weight: 600;
  width: 150px;
  cursor: pointer;
  font-family: Lexend;
  &:hover {
    background-color: #18d193;
  }

  ${(props) =>
    props.disabled &&
    `
    opacity: 0.5;
    cursor: not-allowed;
  `}
`;

export const PopoverButton = styled.button`
  width: 40px;
  height: 40px;
  cursor: pointer;
  background-color: initial;
  border: none;
  color: #fff;
  margin-right: 10px;
`;

export const GithubLink = styled.a`
  color: #fff;
  &:hover {
    color: #24ffb5;
  }
`;

export const Tag = styled.button`
  font-size: 11px;
  color: #00f9ed;
  background-color: #00f9ec1c;
  padding: 4px;
  padding-left: 6px;
  padding-right: 6px;
  border-radius: 14px;
  margin-right: 5px;
  border: none;
  cursor: pointer;
  font-family: "Lexend";
`;

export const Visibility = styled.div`
  color: #7392b1;
  font-size: 12px;
  margin-left: 10px;
  margin-top: 2px;
  border: 1px solid #7392b161;
  padding: 3px;
  padding-left: 6px;
  padding-right: 6px;
  border-radius: 14px;
`;

export const Archive = styled(Visibility)`
  color: #ff6600;
  border: 1px solid #ff6600;
  font-weight: 500;
  height: 18px;
`;

export default {
  Tab: {
    Tab: {
      style: ({
        $isActive,
        $theme,
      }: {
        $isActive: string;
        $theme: { primaryFontFamily: string };
      }) => ({
        backgroundColor: "#0f0124",
        color: $isActive ? "#24ffb5" : "#fff",
        fontFamily: $theme.primaryFontFamily,
        fontSize: "16px",
        ":hover": {
          color: "#24ffb5",
          backgroundColor: "#0f0124",
        },
      }),
    },
  },
  Tabs: {
    TabHighlight: {
      style: {
        backgroundColor: "#24ffb5",
      },
    },
    TabBorder: {
      style: {
        height: "0px",
      },
    },
  },
  StatefulMenu: {
    Option: {
      props: {
        overrides: {
          ListItem: {
            style: ({ $theme }: { $theme: { primaryFontFamily: string } }) => ({
              fontFamily: $theme.primaryFontFamily,
              color: "#fff",
              ":hover": {
                color: "rgb(36, 255, 181)",
              },
            }),
          },
        },
      },
    },
    List: {
      style: {
        border: "1px solid rgb(71 5 94 / 29%)",
      },
    },
  },
};
