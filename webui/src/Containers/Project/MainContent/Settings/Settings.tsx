import { FC } from "react";
import General from "./General";
import Repository from "./Repository";
import DangerZone from "./DangerZone";

const Settings: FC = () => {
  const displayRepositorySection =
    import.meta.env.VITE_APP_API_URL?.includes("api.fluentci.io") ||
    location.hostname === "app.fluentci.io";
  return (
    <>
      <General />
      {displayRepositorySection && <Repository />}
      <DangerZone />
    </>
  );
};

export default Settings;
