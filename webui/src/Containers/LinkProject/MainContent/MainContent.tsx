import { FC, useEffect, useState } from "react";
import { Container } from "./styles";
import Header from "../../../Components/Header";
import Organizations from "./Organizations";
import Repositories from "./Repositories";
import { useAuth } from "../../../lib/auth";

const MainContent: FC = () => {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchToken = async () => {
      const token = await getToken({
        skipCache: true,
      });
      localStorage.setItem("token", token!);
      setLoading(false);
    };
    fetchToken();
  }, [getToken]);

  return (
    <Container>
      <Header />
      {!loading && (
        <>
          <Organizations />
          <Repositories />
        </>
      )}
    </Container>
  );
};

export default MainContent;
