import { FC, useEffect, useState } from "react";
import Header from "./Header";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  Project,
  Repository,
  Run,
  useCancelRunMutation,
  useGetActionsLazyQuery,
  useGetActionsQuery,
  useGetLinkedRepositoryLazyQuery,
  useGetProjectLazyQuery,
  useGetRunLazyQuery,
  useRunPipelineMutation,
} from "../../Hooks/GraphQL";
import { useRecoilState, useRecoilValue } from "recoil";
import { ComposerState } from "../../Containers/Project/MainContent/Composer/ComposerState";
import { AuthState } from "../../Containers/Auth/AuthState";
import { ProjectState } from "../../Containers/Project/ProjectState";
import { PipelineState } from "./PipelineState";

export type HeaderWithDataProps = {
  breadcrumbs?: { title: string; link?: string }[];
};

const HeaderWithData: FC<HeaderWithDataProps> = () => {
  const me = useRecoilValue(AuthState);
  const [runId, setRunId] = useState<string | null | undefined>(null);
  const composerState = useRecoilValue(ComposerState);
  const [{ runs }, setPipelineState] = useRecoilState(PipelineState);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { id } = useParams();
  const [{ project }, setProjectState] = useRecoilState(ProjectState);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [actions, setActions] = useState<any[]>([]);
  const [run, setRun] = useState<Run | null | undefined>(null);
  const [getProject] = useGetProjectLazyQuery({
    variables: {
      id: id!,
    },
    fetchPolicy: "cache-and-network",
  });
  const [getRun] = useGetRunLazyQuery({
    variables: {
      id: id!,
    },
  });
  const [runPipeline] = useRunPipelineMutation();
  const [cancelRun] = useCancelRunMutation();
  const [getActions] = useGetActionsLazyQuery();
  const { data } = useGetActionsQuery({
    variables: {
      projectId: id!,
    },
    fetchPolicy: "cache-and-network",
  });
  const [linkedRepository, setLinkedRepository] = useState<
    Repository | null | undefined
  >(null);
  const [getLinkedRepository] = useGetLinkedRepositoryLazyQuery();
  const [loading, setLoading] = useState(false);

  const setProject = (value?: Project | null) =>
    setProjectState({ project: value });

  useEffect(() => {
    if (pathname.startsWith("/run")) {
      setRunId(id);
      getRun().then(({ data }) => {
        setRun(data?.getRun);
        if (data?.getRun?.projectId) {
          getProject({
            variables: {
              id: data.getRun.projectId,
            },
            fetchPolicy: "cache-and-network",
          }).then(({ data }) => setProject(data?.project));
        }
      });
      return;
    }
    if (
      pathname.startsWith("/project") ||
      pathname.startsWith("/link-project")
    ) {
      getProject({
        variables: {
          id: id!,
        },
        fetchPolicy: "cache-and-network",
      }).then(({ data }) => setProject(data?.project));
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!id) {
      return;
    }
    getLinkedRepository({
      variables: {
        projectId: pathname.startsWith("/run") ? project!.id : id,
      },
      fetchPolicy: "network-only",
    }).then((res) => setLinkedRepository(res.data?.linkedRepository));
  }, [getLinkedRepository, id, project, pathname]);

  useEffect(() => {
    if (!data) {
      return;
    }
    setActions(data.actions || []);
  }, [data]);

  const onRun = () => {
    runPipeline({
      variables: {
        projectId: project!.id!,
      },
    }).then(({ data }) => {
      setLoading(false);
      if (data?.runPipeline) {
        setPipelineState({
          runs: { ...runs, [data.runPipeline.id]: true },
        });
        navigate(`/run/${data.runPipeline.id}`);
      }
    });
    setLoading(true);
  };

  const onCancelRun = async () => {
    await cancelRun({
      variables: {
        id: runId!,
      },
    });
    setPipelineState({
      runs: { ...runs, [runId!]: false },
    });
  };

  const isOwner =
    (project?.owner === me?.github && project?.owner) ||
    (!import.meta.env.VITE_APP_API_URL?.includes("api.fluentci.io") &&
      location.hostname !== "app.fluentci.io");

  const breadcrumbs: { title: string; link?: string }[] = [
    {
      title: isOwner ? "Projects" : project?.owner || "",
      link: isOwner ? "/" : `/${project?.owner}`,
    },
    {
      title: project?.displayName || project?.name || "",
      link: run && project?.id ? `/project/${project.id}` : undefined,
    },
  ];

  if (run) {
    breadcrumbs.push({
      title: run.name,
    });
  }

  useEffect(() => {
    if (!project) {
      return;
    }
    setTimeout(() => {
      getActions({
        variables: {
          projectId: pathname.startsWith("/run") ? project!.id : id!,
        },
        fetchPolicy: "cache-and-network",
      }).then(({ data }) => {
        setActions(data?.actions || []);
      });
    }, 1500);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerState]);
  return (
    <Header
      id="1"
      onRun={onRun}
      breadcrumbs={breadcrumbs}
      showRunButton={
        (!import.meta.env.VITE_APP_API_URL?.includes("api.fluentci.io") &&
          location.hostname !== "app.fluentci.io" &&
          project?.path !== "empty" &&
          !!actions?.filter((x) => x.enabled).length) ||
        (me?.github === project?.owner &&
          !!me?.github &&
          !!project &&
          !pathname.startsWith("/link-project") &&
          ((project?.path !== "empty" &&
            !!actions?.filter((x) => x.enabled).length) ||
            (project?.path !== "empty" && !linkedRepository) ||
            (!!linkedRepository && !!actions?.filter((x) => x.enabled).length)))
      }
      loading={loading}
      linkedRepository={linkedRepository}
      project={project}
      isPublic={project?.isPrivate === false}
      isArchived={project?.archived === true}
      // running={!!runs[runId!] || run?.status === "RUNNING"}
      onCancelRun={onCancelRun}
    />
  );
};

export default HeaderWithData;
