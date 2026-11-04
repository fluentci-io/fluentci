import styled from "@emotion/styled";

export const Inner = styled.div`
  cursor: pointer;
  height: 150px;
  border: 1px solid #5324ffa3;
  border-radius: 6px;
  display: flex;
  justify-content: center;
  padding-left: 20px;
  padding-right: 20px;
  flex-direction: column;
  position: relative;
`;

export const CardFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  color: #24ffb5;
  height: 40px;
  position: absolute;
  bottom: 0;
  width: calc(100% - 54px);
  padding-right: 20px;
  padding-left: 20px;
  font-size: 13px;
`;
