import { FC } from "react";
import ModuleSettingsTab, { ModuleSettingsProps } from "./ModuleSettingsTab";

const ModuleSettingsTabWithData: FC<ModuleSettingsProps> = (props) => {
  return <ModuleSettingsTab {...props} />;
};

export default ModuleSettingsTabWithData;
