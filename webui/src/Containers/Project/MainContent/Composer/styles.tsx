import styled from "@emotion/styled";

export const PlusButton = styled.button`
  height: 30px;
  width: 30px;
  background-color: initial;
  border-style: none;
  border: 1px solid #5324ffa3;
  border-radius: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 25px;
  box-shadow: 2px 4px #5324ff20;
  -webkit-animation: zoom-in-zoom-out 500ms; /* Safari, Chrome and Opera > 12.1 */
  -moz-animation: zoom-in-zoom-out 500ms; /* Firefox < 16 */
  -ms-animation: zoom-in-zoom-out 500ms; /* Internet Explorer */
  -o-animation: zoom-in-zoom-out 500ms; /* Opera < 12.1 */
  animation: zoom-in-zoom-out 500ms;

  @keyframes zoom-in-zoom-out {
    0% {
      transform: scale(1, 1);
    }
    50% {
      transform: scale(1.5, 1.5);
    }
    100% {
      transform: scale(1, 1);
    }
  }
`;

export const ConnectorContainer = styled.div`
  width: 30px;
  margin-left: 25px;
`;

export const Connector = styled.div`
  height: 50px;
  width: 1px;
  background-color: #5324ffa3;
  margin: 0 auto;
`;
