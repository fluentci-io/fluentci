import { FC } from "react";
import { Spinner } from "baseui/spinner";
import { CheckCircle } from "@styled-icons/boxicons-solid";
import { Container, Line } from "./styles";

export type LoadingProps = {
  pkgxReady: boolean;
  denoReady: boolean;
  hidePkgx?: boolean;
  hideDeno?: boolean;
};

const Loading: FC<LoadingProps> = (props) => {
  const { pkgxReady, denoReady, hideDeno, hidePkgx } = props;
  return (
    <Container>
      <div>
        {!hidePkgx && (
          <Line>
            {pkgxReady && (
              <CheckCircle
                size={22}
                style={{ marginRight: 15 }}
                color="#24ffd7"
              />
            )}
            {!pkgxReady && (
              <Spinner
                $size={"15px"}
                $borderWidth={"3px"}
                style={{
                  borderRightColor: "#ffffff22",
                  borderLeftColor: "#ffffff22",
                  borderTopColor: "#ffffff22",
                  borderBottomColor: "#24ffd7",
                  marginRight: 15,
                }}
              />
            )}
            <div>Setting up pkgx ...</div>
          </Line>
        )}

        {!hideDeno && (
          <Line>
            {denoReady && (
              <CheckCircle
                size={22}
                style={{ marginRight: 15 }}
                color="#24ffd7"
              />
            )}
            {!denoReady && (
              <Spinner
                $size={"15px"}
                $borderWidth={"3px"}
                style={{
                  borderRightColor: "#ffffff22",
                  borderLeftColor: "#ffffff22",
                  borderTopColor: "#ffffff22",
                  borderBottomColor: "#24ffd7",
                  marginRight: 15,
                }}
              />
            )}
            <div>Setting up Deno ...</div>
          </Line>
        )}
      </div>
    </Container>
  );
};

Loading.defaultProps = {
  hidePkgx: true,
  hideDeno: true,
};

export default Loading;
