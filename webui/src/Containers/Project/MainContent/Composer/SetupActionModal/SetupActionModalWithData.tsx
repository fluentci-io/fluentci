import { FormProvider, useForm } from "react-hook-form";
import SetupActionModal from "./SetupActionModal";
import { FC, useEffect } from "react";
import { Pipeline } from "../NewActionModal/NewActionModalWithData";
import { useRecoilState, useRecoilValue } from "recoil";
import { ComposerState } from "../ComposerState";
import { zodResolver } from "@hookform/resolvers/zod";
import { schema } from "./schema";
import { useSaveActionsMutation } from "../../../../../Hooks/GraphQL";
import { useParams } from "react-router-dom";
import _ from "lodash";
import { ProjectState } from "../../../ProjectState";
import { AuthState } from "../../../../Auth/AuthState";

export type SetupActionModalWithDataProps = {
  onClose: () => void;
  onAddThisAction: (action: Pipeline) => void;
  onSaveChanges: () => void;
  isOpen: boolean;
  selectedAction: Pipeline;
  editAction: boolean;
  actionPosition?: number | null;
};

const SetupActionModalWithData: FC<SetupActionModalWithDataProps> = (props) => {
  const { id } = useParams();
  const me = useRecoilValue(AuthState);
  const { project } = useRecoilValue(ProjectState);
  const [saveActions] = useSaveActionsMutation();
  const [actions, setActions] = useRecoilState(ComposerState);
  const _setActions = (actions: Pipeline[]) => {
    setActions(actions);
    saveActions({
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
  };
  const methods = useForm({
    mode: "onChange",
    resolver: zodResolver(schema),
    defaultValues: {
      commands: props.selectedAction?.command,
      name: props.selectedAction?.command?.trimEnd().split("\n")?.reverse()[0],
      useWasmPlugin: props.selectedAction?.useWasmPlugin,
    },
  });

  useEffect(() => {
    methods.setValue("commands", props.selectedAction?.command);
    methods.setValue(
      "name",
      props.selectedAction?.actionName ||
        props.selectedAction?.command?.trimEnd().split("\n")?.reverse()[0]
    );
    methods.setValue(
      "useWasmPlugin",
      _.get(props.selectedAction, "useWasmPlugin", true)
    );
  }, [props.selectedAction, methods]);

  const onSubmit = (data: {
    name: string;
    commands: string;
    useWasmPlugin?: boolean;
  }) => {
    props.onSaveChanges();
    if (!props.editAction) {
      return;
    }
    const updated = [...actions];
    updated[props.actionPosition!] = {
      ...updated[props.actionPosition!],
      command: data.commands,
      actionName: data.name,
      useWasmPlugin: data.useWasmPlugin,
    };
    _setActions(updated);
  };

  return (
    <FormProvider {...methods}>
      <SetupActionModal
        {...props}
        onClose={() => {
          methods.reset({
            commands: props.selectedAction?.command,
            name:
              props.selectedAction?.actionName ||
              props.selectedAction?.command?.split("\n")?.reverse()[0],
            useWasmPlugin: _.get(props.selectedAction, "useWasmPlugin", true),
          });
          props.onClose();
        }}
        handleSubmit={methods.handleSubmit(onSubmit)}
        disabled={
          project?.archived === true ||
          (me?.github !== project?.owner &&
            (import.meta.env.VITE_APP_API_URL?.includes("api.fluentci.io") ||
              location.hostname === "app.fluentci.io"))
        }
      />
    </FormProvider>
  );
};

export default SetupActionModalWithData;
