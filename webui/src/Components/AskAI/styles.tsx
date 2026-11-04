import styled from "@emotion/styled";

export const Container = styled.div`
  cursor: pointer;
  position: fixed;
  height: 50px;
  width: 50px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  bottom: 60px;
  color: #0f0124;
  background-color: #02f3e6;
  right: 80px;
  z-index: 1;

  @media screen and (max-width: 768px) {
    right: 30px;
  }
`;
