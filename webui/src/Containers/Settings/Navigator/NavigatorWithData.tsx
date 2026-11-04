import { useRecoilState } from "recoil";
import Navigator from "./Navigator";
import { navigatorState } from "./NavigatorState";
import React from "react";

const NavigatorWithData = () => {
  const [{ current }, setActiveKey] = useRecoilState(navigatorState);
  return (
    <Navigator
      activeKey={current}
      setActiveKey={(key: React.Key) =>
        setActiveKey({
          current: key,
        })
      }
    />
  );
};

export default NavigatorWithData;
