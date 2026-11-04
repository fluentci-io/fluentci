import { FC } from "react";
import MainContent from "./MainContent";
import { useRecoilState, useRecoilValue } from "recoil";
import { TabsState } from "./TabsState";
import { AuthState } from "../../Auth/AuthState";
import { ProjectState } from "../ProjectState";

const MainContentWithData: FC = () => {
  const state = useRecoilState(TabsState);
  const me = useRecoilValue(AuthState);
  const { project } = useRecoilValue(ProjectState);
  return (
    <MainContent
      onTabChange={(value) => state[1](value)}
      displaySettings={
        (me?.github === project?.owner && !!me?.github) ||
        location.hostname !== "app.fluentci.io"
      }
    />
  );
};

export default MainContentWithData;
