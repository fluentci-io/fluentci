import styled from "@emotion/styled";

export const Title = styled.div`
  font-size: 18px;
  margin-bottom: 4px;
`;

export const Text = styled.p`
  font-size: 14px;
  margin: 0px;
  color: #ffffffb2;
`;

export const Label = styled.div`
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
`;

export const Section = styled.div`
  margin-bottom: 32px;
`;

export const ClusterStart = styled.div`
  color: #f701ad;
  border-right: 1px solid #f701ad;
  padding: 6px;
  background-color: #f701ad28;
`;

export const Cluster = styled.div`
  font-size: 13px;
  border: 1px solid #f701ad;
  width: 230px;
  border-radius: 6px;
  display: flex;
  align-items: center;
`;

export const SaveButton = styled.button`
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
    opacity: 0.8;
  }
`;

export const Row = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
`;

export const UnlinkButton = styled.button`
  cursor: pointer;
  font-family: Lexend;
  height: 40px;
  width: 150px;
  color: #fff;
  background-color: #ee0063;
  border: none;
  font-weight: 600;
  display: flex;
  justify-content: center;
  align-items: center;

  &:hover {
    opacity: 0.8;
  }
`;

export const DeleteButton = styled(UnlinkButton)`
  color: #ee0063;
  background-color: #ee006317;
  width: 200px;
`;

export const LinkGithubRepo = styled.div`
  display: flex;
  flex-direction: row;
  align-content: center;
  justify-content: center;
  background-color: #5a00e1;
  max-width: 411px;
  border-radius: 6px;
  height: 48px;
  margin-top: 10px;
`;

export default {
  Input: {
    Root: {
      style: { border: "1px solid #ffffff28" },
    },
    Input: {
      style: {
        fontFamily: "Lexend",
      },
    },
  },
  Spinner: {
    borderRightColor: "#ffffff22",
    borderLeftColor: "#ffffff22",
    borderTopColor: "#ffffff22",
    borderBottomColor: "#000",
  },
};
