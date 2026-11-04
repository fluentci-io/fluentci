import { useEffect } from "react";
import { SignIn } from "../../lib/auth";
import styled from "@emotion/styled";
import { useSearchParams } from "react-router-dom";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
`;

export default function Auth() {
  const [qs] = useSearchParams();
  const redirect = qs.get("redirect");
  const action = qs.get("action");
  const id = qs.get("id");

  useEffect(() => {
    if (redirect && action && id) {
      localStorage.setItem(
        "extra",
        JSON.stringify({
          redirect,
          action,
          id,
        })
      );
    }
  }, [redirect, action, id]);

  return (
    <Container>
      <SignIn path="/auth" />
    </Container>
  );
}
