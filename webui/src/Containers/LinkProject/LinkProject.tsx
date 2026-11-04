import { FC, useEffect } from "react";
import styled from "@emotion/styled";
import Titlebar from "../../Components/Titlebar";
import Navbar from "../../Components/Navbar";
import MainContent from "./MainContent";
import AskAI from "../../Components/AskAI";
import { useNavigate, useParams } from "react-router-dom";
import { useCreateProjectMutation } from "../../Hooks/GraphQL";

const Container = styled.div`
  height: calc(100vh - 30px);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const LinkProject: FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [createProject] = useCreateProjectMutation();

  useEffect(() => {
    if (!id || !navigate || !createProject) {
      return;
    }
    const fromRepository = localStorage.getItem("redirected_from_new_project");
    if (fromRepository) {
      localStorage.removeItem("redirected_from_new_project");
      createProject({
        variables: {
          fromRepository,
        },
      });
      navigate(`/project/${id}`);
    }
  }, [navigate, id, createProject]);

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

export default LinkProject;
