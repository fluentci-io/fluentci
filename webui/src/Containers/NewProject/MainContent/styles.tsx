import styled from "@emotion/styled";

export const Title = styled.div`
  font-size: 24px;
  color: #fff;
`;

export const Subtitle = styled.div`
  color: rgba(203, 217, 231, 0.602);
  margin-bottom: 2.5rem;
`;

export const Container = styled.div`
  margin-left: 100px;
  margin-top: 30px;
  margin-right: 100px;
  color: #fff;
`;

export const StartFromScratch = styled.div`
  cursor: pointer;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  background-color: #5a00e1;
  max-width: 300px;
  border-radius: 6px;
  height: 48px;
  font-weight: 500;
  color: #fff;
`;

export const Card = styled.div`
  background-color: #10072c;
  border: 1px solid #ffffff1f;
  height: 140px;
  border-radius: 6px;
  padding: 20px;
  position: relative;
`;

export const CardTitle = styled.div`
  font-weight: 500;
`;

export const Logo = styled.img`
  height: 28px;
  width: 28px;
  max-width: 100%;
`;

export const CardHeader = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
`;

export const Description = styled.div`
  font-size: 14px;
  width: calc(100% - 40px);
  color: rgba(203, 217, 231, 0.602);
`;

export const LinkGithubRepo = styled.a`
  font-family: monospace;
  &:hover {
    text-decoration: underline;
  }
`;

export const CardFooter = styled.div`
  position: absolute;
  bottom: 20px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: calc(100% - 40px);
`;
