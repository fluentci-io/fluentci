import { FC, useEffect } from "react";
import styled from "@emotion/styled";
import MainContent from "./MainContent";
import Navbar from "../../Components/Navbar";
import AskAI from "../../Components/AskAI";
import { useStarPackageMutation } from "../../Hooks/GraphQL";
import { useAuth } from "../../lib/auth";

const Container = styled.div`
  height: calc(100vh - 30px);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const Home: FC = () => {
  const { isSignedIn, getToken } = useAuth();
  const [starPackage] = useStarPackageMutation();

  useEffect(() => {
    if (location.hostname !== "app.fluentci.io") {
      return;
    }

    const extra = localStorage.getItem("extra");
    if (extra) {
      const { id, redirect, action } = JSON.parse(extra);
      const redirectToPackage = async () => {
        const token = await getToken({ skipCache: true });
        localStorage.setItem("token", token!);

        switch (action) {
          case "star":
            starPackage({
              variables: {
                id,
              },
            })
              .then((res) => {
                localStorage.removeItem("extra");
                console.log(res);
                window.location.href = `https://fluentci.io${redirect}`;
              })
              .catch((e) => console.error(e));
            break;
          default:
            break;
        }
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      redirectToPackage().catch((e: any) => console.error(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

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

export default Home;
