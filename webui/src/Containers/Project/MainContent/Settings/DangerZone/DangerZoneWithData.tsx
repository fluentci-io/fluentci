import { FC, useState } from "react";
import DangerZone from "./DangerZone";
import { useRecoilState } from "recoil";
import { ProjectState } from "../../../ProjectState";
import _ from "lodash";
import {
  useArchiveProjectMutation,
  useChangeProjectVisibilityMutation,
  useDeleteProjectMutation,
  useGetProjectLazyQuery,
  useUnarchiveProjectMutation,
} from "../../../../../Hooks/GraphQL";
import { useNavigate } from "react-router-dom";

const DangerZoneWithData: FC = () => {
  const navigate = useNavigate();
  const [{ project }, setProject] = useRecoilState(ProjectState);
  const [getProject] = useGetProjectLazyQuery();
  const [deleteProject] = useDeleteProjectMutation();
  const [archiveProject] = useArchiveProjectMutation();
  const [unarchiveProject] = useUnarchiveProjectMutation();
  const [changeProjectVisibity] = useChangeProjectVisibilityMutation();

  const [confirmDeleteProjectModalIsOpen, setConfirmDeleteProjectModalIsOpen] =
    useState(false);
  const [
    confirmProjectVisibilityModalIsOpen,
    setConfirmProjectVisibilityModalIsOpen,
  ] = useState(false);
  const [
    confirmArchiveProjectModalIsOpen,
    setConfirmArchiveProjectModalIsOpen,
  ] = useState(false);

  const onChangeVisibility = async (confirm = false) => {
    if (confirm) {
      onClose();
      await changeProjectVisibity({
        variables: {
          id: project!.id!,
          isPublic: !!project?.isPrivate,
        },
      });
      const { data } = await getProject({
        variables: {
          id: project!.id!,
        },
      });
      setProject({ project: data?.project });

      return;
    }
    setConfirmProjectVisibilityModalIsOpen(true);
  };

  const onArchive = async (confirm = false) => {
    if (confirm) {
      onClose();
      if (project?.archived) {
        await unarchiveProject({
          variables: {
            id: project!.id!,
          },
        });

        const { data } = await getProject({
          variables: {
            id: project!.id!,
          },
        });
        setProject({ project: data?.project });

        return;
      }

      await archiveProject({
        variables: {
          id: project!.id!,
        },
      });

      const { data } = await getProject({
        variables: {
          id: project!.id!,
        },
      });
      setProject({ project: data?.project });

      return;
    }
    setConfirmArchiveProjectModalIsOpen(true);
  };

  const onDelete = async (confirm = false) => {
    if (confirm) {
      onClose();
      await deleteProject({
        variables: {
          id: project!.id!,
        },
      });
      navigate("/");
      return;
    }
    setConfirmDeleteProjectModalIsOpen(true);
  };

  const onClose = () => {
    setConfirmDeleteProjectModalIsOpen(false);
    setConfirmProjectVisibilityModalIsOpen(false);
    setConfirmArchiveProjectModalIsOpen(false);
  };

  return (
    <DangerZone
      displayRepositorySection={
        import.meta.env.VITE_APP_API_URL?.includes("api.fluentci.io") ||
        location.hostname === "app.fluentci.io"
      }
      isPublic={project?.isPrivate !== true}
      isArchived={project?.archived === true}
      onChangeVisibility={onChangeVisibility}
      onArchive={onArchive}
      onDelete={onDelete}
      confirmDeleteProjectModalIsOpen={confirmDeleteProjectModalIsOpen}
      confirmProjectVisibilityModalIsOpen={confirmProjectVisibilityModalIsOpen}
      confirmArchiveProjectModalIsOpen={confirmArchiveProjectModalIsOpen}
      onClose={onClose}
      projectSlug={
        _.replace(
          project?.displayName?.toLowerCase() || "",
          new RegExp(" ", "g"),
          "-"
        ) ||
        project?.name ||
        ""
      }
    />
  );
};

export default DangerZoneWithData;
