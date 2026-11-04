import { css } from "@emotion/react";
import styled from "@emotion/styled";

export const Container = styled.div<{ active?: boolean }>`
  display: flex;
  flex-direction: row;
  align-items: center;
  border-radius: 8px;
  padding: 10px;
  border: 1px solid #5324ffa3;
  height: 78px;
  box-shadow: 2px 4px #5324ff20;
  padding-left: 18px;
  padding-right: 18px;
  cursor: pointer;
  ${(props) =>
    !props.active &&
    css`
      opacity: 0.5;
    `}
`;

export const ActionName = styled.div`
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const PopoverButton = styled.button<{ disabled?: boolean }>`
  width: 40px;
  height: 40px;
  cursor: pointer;
  background-color: initial;
  border: none;
  color: #fff;
  ${(props) => props.disabled && `opacity: 0.5; cursor: not-allowed;`}
`;

export const Popover = styled.div`
  background-color: #0f0124;
  color: #fff;
`;
