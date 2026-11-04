import styled from "@emotion/styled";

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  width: 80vw;
  margin: 0 auto;
  margin-top: 60px;
`;

export const Title = styled.div`
  font-size: 25px;
  margin-bottom: 20px;
  font-weight: 500;
  flex: 1;
`;

export const Header = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 20px;
  margin-left: 50px;
  margin-right: 50px;
`;

export const RunButton = styled.button`
  height: 40px;
  background-color: #24ffb5;
  color: #000;
  border: none;
  font-weight: 600;
  width: 150px;
  cursor: pointer;
  &:hover {
    background-color: #18d193;
  }
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
        backgroundColor: "#0f0124 !important",
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
