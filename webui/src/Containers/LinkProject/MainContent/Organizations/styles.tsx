import styled from "@emotion/styled";

export const Container = styled.div`
  display: flex;
  flex-direction: row;
  flex: 1;
  margin-bottom: 25px;
`;

export const Wrapper = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 50px;
`;

export const Label = styled.label`
  color: #8973b1e3;
  font-size: 15px;
`;

export default {
  Select: {
    Root: {
      style: {
        fontFamily: "Lexend",
        width: "30%",
      },
    },
    DropdownListItem: {
      style: {
        fontFamily: "Lexend",
      },
    },
    ControlContainer: {
      style: {
        border: "none",
      },
    },
  },
};
