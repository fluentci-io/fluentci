import { FC } from "react";
import LinkRepo from "./LinkRepo";
import { useParams } from "react-router-dom";
import { useGetOrganizationsQuery } from "../../../../../../Hooks/GraphQL";

const LinkRepoWithData: FC = () => {
  const { id } = useParams();
  const { data } = useGetOrganizationsQuery({
    variables: {
      provider: "GitHub",
    },
  });
  const orgs = data?.organizations || [];
  return <LinkRepo projectId={id!} orgs={orgs} />;
};

export default LinkRepoWithData;
