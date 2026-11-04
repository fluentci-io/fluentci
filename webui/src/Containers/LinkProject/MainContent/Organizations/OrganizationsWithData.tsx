import { FC, useEffect } from "react";
import Organizations from "./Organizations";
import { useRecoilState } from "recoil";
import { OrganizationsState } from "./OrganizationsState";
import { useGetOrganizationsQuery } from "../../../../Hooks/GraphQL";

const OrganizationsWithData: FC = () => {
  const { data } = useGetOrganizationsQuery({
    variables: {
      provider: "GitHub",
    },
    fetchPolicy: "cache-and-network",
  });
  const [{ orgs, current }, setState] = useRecoilState(OrganizationsState);

  useEffect(() => {
    if (!data?.organizations) {
      return;
    }

    const organizations = data.organizations.map((x) => ({
      id: x.id,
      label: x.name,
    }));
    setState({
      orgs: organizations,
      current: organizations.length
        ? [organizations[organizations.length - 1]]
        : [],
    });
  }, [setState, data]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onSelect = (value: any) => {
    setState({
      orgs,
      current: value,
    });
  };

  return <Organizations orgs={orgs} current={current} onSelect={onSelect} />;
};

export default OrganizationsWithData;
