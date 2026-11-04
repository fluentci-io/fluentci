export default {
  Input: {
    Root: {
      style: {
        border: "none",
        BorderRadius: "0px !important",
      },
    },
    Input: {
      style: ({ $theme }: { $theme: { primaryFontFamily: string } }) => ({
        color: "#fff",
        backgroundColor: "#0f0124",
        border: "none !important",
        outline: "none",
        caretColor: "#fff",
        fontFamily: $theme.primaryFontFamily,
      }),
    },
    InputContainer: {
      style: {
        outline: "none",
        borderBottom: "none !important",
      },
    },
  },
};
