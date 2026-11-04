import { FC, useEffect } from "react";
import ViewMode from "./ViewMode";
import { useRecoilState, useRecoilValue } from "recoil";
import { ViewModeState } from "./ViewModeState";
import { TabsState } from "../../TabsState";

const ViewModeWithData: FC = () => {
  const [mode, setMode] = useRecoilState(ViewModeState);
  const tab = useRecoilValue(TabsState);

  useEffect(() => {
    setMode("stacked");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return <ViewMode mode={mode} onSetViewMode={setMode} />;
};

export default ViewModeWithData;
