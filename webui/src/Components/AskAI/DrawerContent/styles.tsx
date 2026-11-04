import { css } from "@emotion/react";
import styled from "@emotion/styled";

export const Avatar = styled.div`
  cursor: pointer;
  height: 50px;
  width: 50px;
  margin-right: 20px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  bottom: 60px;
  color: #0f0124;
  background-color: #02f3e6;
`;

export const Sample = styled.button`
  font-family: Lexend;
  cursor: pointer;
  color: #fff;
  padding: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 5px;
  margin-bottom: 10px;
  text-align: left;
  background-color: initial;
  &:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }
`;

export const Textarea = styled.textarea`
  font-family: Lexend;
  background-color: #10062d;
  appearance: auto;
  border-bottom-color: rgb(242, 242, 244);
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  border-bottom-style: none;
  border-bottom-width: 0px;
  border-image-outset: 0;
  border-image-repeat: stretch;
  border-image-slice: 100%;
  border-image-source: none;
  border-image-width: 1;
  border-left-color: rgb(242, 242, 244);
  border-left-style: none;
  border-left-width: 0px;
  border-right-color: rgb(242, 242, 244);
  border-right-style: none;
  border-right-width: 0px;
  border-top-color: rgb(242, 242, 244);
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
  border-top-style: none;
  border-top-width: 0px;
  box-sizing: border-box;
  color: rgb(255, 255, 255);
  column-count: auto;
  cursor: text;
  display: block;
  flex: 1;
  font-feature-settings: normal;
  font-kerning: auto;
  font-optical-sizing: auto;
  font-size: 16px;
  font-stretch: 100%;
  font-style: normal;
  font-variant-alternates: normal;
  font-variant-caps: normal;
  font-variant-east-asian: normal;
  font-variant-ligatures: normal;
  font-variant-numeric: normal;
  font-variant-position: normal;
  font-variation-settings: normal;
  font-weight: 400;
  min-height: 64px;
  border-radius: 32px;
  letter-spacing: normal;
  line-height: 22.75px;
  margin-bottom: 0px;
  margin-left: 0px;
  margin-right: 8px;
  margin-top: 0px;
  outline-color: rgba(0, 0, 0, 0);
  outline-offset: 2px;
  outline-style: solid;
  outline-width: 2px;
  overflow-wrap: break-word;
  padding-bottom: 12px;
  padding-left: 22px;
  padding-right: 72px;
  padding-top: 22px;
  resize: none;
  tab-size: 4;
  text-align: start;
  text-indent: 0px;
  text-rendering: auto;
  text-shadow: none;
  text-size-adjust: 100%;
  text-transform: none;
  text-wrap: wrap;
  white-space-collapse: preserve;
  width: 100%;
  word-spacing: 0px;
  padding-right: 47px;
  -webkit-rtl-ordering: logical;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
  -webkit-border-image: none;
`;

export const TextAreaWrapper = styled.div`
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  position: relative;
  padding-left: 15px;
  padding-right: 15px;
`;

export const SendButton = styled.button<{ enabled?: boolean }>`
  background-color: #fff;
  height: 40px;
  width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  opacity: 0.2;
  position: absolute;
  right: 35px;
  bottom: 12px;
  color: #10062d;
  cursor: default;

  ${(props) =>
    props.enabled &&
    css`
      cursor: pointer;
      opacity: 1;
    `}
`;

export const CopyButton = styled.button`
  position: absolute;
  right: 10px;
  top: 10px;
  z-index: 1;
  color: #ffffff8f;
  &:hover {
    color: #fff !important;
  }
`;

export const BubbleWrapper = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
`;

export const Bubble = styled.div`
  background-color: rgb(14 255 242 / 22%);
  color: #02f3e6;
  margin-top: 20px;
  text-align: right;
  padding: 20px;
  border-radius: 10px;
`;

export const Clear = styled.button`
  color: #fff;
  font-family: Lexend;
  background-color: initial;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 5px;
  height: 35px;
  padding-left: 10px;
  padding-right: 10px;
  margin-right: 20px;
  &:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }
`;
