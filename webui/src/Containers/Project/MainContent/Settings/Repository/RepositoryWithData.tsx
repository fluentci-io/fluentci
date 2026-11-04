import { FC, useState } from "react";
import Repository from "./Repository";
import {
  useGetLinkedRepositoryQuery,
  useGetOrganizationsQuery,
  useUnlinkRepositoryMutation,
} from "../../../../../Hooks/GraphQL";
import { useRecoilState } from "recoil";
import { ProjectState } from "../../../ProjectState";

const RepositoryWithData: FC = () => {
  const [loadingUnlink, setLoadingUnlink] = useState<boolean>(false);
  const [{ project }] = useRecoilState(ProjectState);

  const {
    data,
    loading: loadingLinkedRepository,
    refetch,
  } = useGetLinkedRepositoryQuery({
    variables: {
      projectId: project!.id,
    },
  });
  const { data: organizationsData } = useGetOrganizationsQuery({
    variables: {
      provider: "GitHub",
    },
  });
  const [unlinkRepository] = useUnlinkRepositoryMutation();
  const onUnlinkRepository = async (repoName: string) => {
    setLoadingUnlink(true);
    await unlinkRepository({
      variables: {
        repoName,
      },
    });
    await refetch();
    setLoadingUnlink(false);
  };

  return (
    <Repository
      linkedRepository={data?.linkedRepository}
      onUnlinkRepository={onUnlinkRepository}
      loadingLinkedRepository={loadingLinkedRepository}
      projectId={project?.id}
      orgs={organizationsData?.organizations || []}
      displayRepositorySection={
        import.meta.env.VITE_APP_API_URL?.includes("api.fluentci.io") ||
        location.hostname === "app.fluentci.io"
      }
      loadingUnlink={loadingUnlink}
    />
  );
};

export default RepositoryWithData;
