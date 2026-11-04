import { FC, useEffect } from "react";
import Navigator from "../Navigator";
import { useRecoilState } from "recoil";
import { navigatorState } from "../Navigator/NavigatorState";

const AccessTokens: FC = () => {
  const state = useRecoilState(navigatorState);
  const setActiveKey = state[1];

  useEffect(() => {
    setActiveKey({
      current: 2,
    });
  }, [setActiveKey]);

  return (
    <>
      <Navigator />
    </>
  );
};

export default AccessTokens;
