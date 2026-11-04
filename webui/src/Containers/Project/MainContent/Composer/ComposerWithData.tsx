import { FC, useEffect } from "react";
import Composer from "./Composer";
import { useRecoilState, useRecoilValue } from "recoil";
import { ComposerState } from "./ComposerState";
import { Pipeline } from "./NewActionModal/NewActionModalWithData";
import {
  useGetActionsQuery,
  useSaveActionsMutation,
} from "../../../../Hooks/GraphQL";
import { useParams } from "react-router-dom";
import { ViewModeState } from "./ViewMode/ViewModeState";

const ComposerWithData: FC = () => {
  const { id } = useParams();
  const { data, refetch } = useGetActionsQuery({
    variables: {
      projectId: id!,
    },
    fetchPolicy: "cache-and-network",
  });
  const [saveActions] = useSaveActionsMutation();
  const mode = useRecoilValue(ViewModeState);
  const [actions, setActions] = useRecoilState(ComposerState);
  const _setActions = async (actions: Pipeline[]) => {
    setActions(actions);
    await saveActions({
      variables: {
        projectId: id!,
        actions: actions.map((action) => ({
          commands: action.command,
          enabled: !!action.active,
          logo: action.logo,
          name: action.actionName!,
          plugin: action.name!,
          useWasm: !!action.useWasmPlugin,
          githubUrl: action.githubUrl,
          env: action.env,
          workingDirectory: action.workingDirectory,
        })),
      },
    });
    await refetch();
  };

  useEffect(() => {
    if (data?.actions) {
      setActions(
        data.actions.map((action) => ({
          id: action.id!,
          name: action.plugin,
          actionName: action.name,
          active: action.enabled,
          useWasmPlugin: action.useWasm,
          command: action.commands,
          description: "",
          githubUrl: action.githubUrl || "",
          logo: action.logo || "",
          packageId: action.plugin,
          downloads: 0,
          version: "",
          license: "",
          defaultBranch: "",
          updatedAt: "",
          comingSoon: false,
          env: action.env,
          workingDirectory: action.workingDirectory,
        }))
      );
      return;
    }
    setActions([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.actions]);

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Composer actions={actions} setActions={_setActions} mode={mode} />;
};

export default ComposerWithData;
