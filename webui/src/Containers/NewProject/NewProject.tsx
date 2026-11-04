import { FC } from "react";
import styled from "@emotion/styled";
import Titlebar from "../../Components/Titlebar";
import Navbar from "../../Components/Navbar";
import AskAI from "../../Components/AskAI";
import MainContent from "./MainContent";

const Container = styled.div`
  height: calc(100vh - 30px);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const NewProject: FC = () => {
  return (
    <>
      <Titlebar />
      <Container>
        <Navbar />
        <MainContent />
        <AskAI />
      </Container>
    </>
  );
};

export default NewProject;
