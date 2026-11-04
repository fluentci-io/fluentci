import { FC } from "react";
import Account from "./Account";
import { useUser } from "../../../../lib/auth";

const AccountWithData: FC = () => {
  const { user } = useUser();
  return (
    <Account
      email={user?.emailAddresses[0].emailAddress || ""}
      username={user?.username || ""}
      displayName={user?.fullName || ""}
    />
  );
};

export default AccountWithData;
