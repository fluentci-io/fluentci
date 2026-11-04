import { FC } from "react";
import styled from "@emotion/styled";
import MainContent from "./MainContent";
import Navbar from "../../Components/Navbar";
import AskAI from "../../Components/AskAI";

const Container = styled.div`
  height: calc(100vh - 30px);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const Project: FC = () => {
  return (
    <>

      <Container>
        <Navbar />
        <MainContent />
        <AskAI />
      </Container>
    </>
  );
};

export default Project;
