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
};
