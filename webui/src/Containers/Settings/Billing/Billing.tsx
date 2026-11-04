import { FC, useEffect } from "react";
import Navigator from "../Navigator";
import { useRecoilState } from "recoil";
import { navigatorState } from "../Navigator/NavigatorState";

const Billing: FC = () => {
  const state = useRecoilState(navigatorState);
  const setActiveKey = state[1];

  useEffect(() => {
    setActiveKey({
      current: 1,
    });
  }, [setActiveKey]);

  return (
    <>
      <Navigator />
    </>
  );
};

export default Billing;
