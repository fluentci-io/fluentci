import { css } from "@emotion/react";
import styled from "@emotion/styled";

export const Container = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-direction: row;
  flex: 1;
`;

export const Bars = styled.div`
  display: flex;
  flex: 1;
  height: 40px;
  justify-content: center;
  margin-right: 10px;
`;

export const Info = styled.div`
  height: 50px;
  color: #7392b1;
  font-size: 12px;
  width: 100px;
`;

export const Value = styled.div`
  font-size: 24px;
  color: #fff;
`;

export const Unit = styled.span`
  font-size: 12px;
  color: #7392b1;
  margin-left: 5px;
`;

export const Status = styled.div<{ status?: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80px;
  width: 50px;
  border-radius: 5px;

  ${({ status }) =>
    status === "SUCCESS" &&
    css`
      background-color: #05f07719;
    `}
  ${({ status }) =>
    status === "FAILURE" &&
    css`
      background-color: #ff006a13;
    `}
    ${({ status }) =>
    status === "PENDING" &&
    css`
      background-color: #ffa60020;
    `}
`;

export const Bar = styled.div<{ max?: number; n?: number; success?: boolean }>`
  height: 0%;
  width: 5px;
  background-color: #ff006a;
  position: absolute;
  border-top-left-radius: 3px;
  border-top-right-radius: 3px;

  left: 0;
  bottom: 0;
  ${({ max }) =>
    max &&
    css`
      height: ${max}%;
    `}
  ${({ n }) =>
    n &&
    css`
      left: ${5 * n + 1 * n}px;
    `}
  ${({ success }) =>
    success === true &&
    css`
      background-color: #05f076;
    `}
`;
