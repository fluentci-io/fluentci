import { FC, useState } from "react";
import { PlusLg } from "@styled-icons/bootstrap";
import Action from "./Action";
import NewActionModal from "./NewActionModal";
import SetupActionModal from "./SetupActionModal";
import { Pipeline } from "./NewActionModal/NewActionModalWithData";
import { Connector, ConnectorContainer, PlusButton } from "./styles";
import ViewMode from "./ViewMode";
import CodePreview from "./CodePreview";

export type ComposerProps = {
  actions: Pipeline[];
  setActions: (values: Pipeline[]) => void;
  mode: "stacked" | "code";
};

const Composer: FC<ComposerProps> = (props) => {
  const { actions, setActions, mode } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<Pipeline | null>(null);
  const [isSetupActionModalOpen, setIsSetupActionModalOpen] = useState(false);
  const [editAction, setEditAction] = useState(false);
  const [actionPosition, setActionPosition] = useState<number | null>(null);
  const [clickedPosition, setClickedPosition] = useState(0);

  function close() {
    setIsOpen(false);
  }

  function onAddNewAction(item: Pipeline) {
    setIsOpen(false);
    setIsSetupActionModalOpen(false);
    const updated = [...actions];
    updated.splice(clickedPosition, 0, item);
    setActions(updated);
  }

  function onClickAction(action: Pipeline, index: number) {
    setActionPosition(index);
    setSelectedAction(action);
    setEditAction(true);
    setIsSetupActionModalOpen(true);
  }

  function onDelete(position: number) {
    const updated = actions.filter((_, index) => index !== position);
    setActions(updated);
  }

  function onDuplicate(position: number) {
    const updated = [...actions];
    const newAction = actions[position];
    updated.splice(position, 0, newAction);
    setActions(updated);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <ViewMode />
      {mode === "stacked" && (
        <div style={{ marginTop: 50 }}>
          {actions.length === 0 && (
            <PlusButton
              onClick={() => {
                setEditAction(false);
                setIsOpen(true);
                setClickedPosition(0);
              }}
            >
              <PlusLg size={15} color="#fff" />
            </PlusButton>
          )}
          {actions.map((action, index) => (
            <div key={index.toString()}>
              <PlusButton
                onClick={() => {
                  setEditAction(false);
                  setIsOpen(true);
                  setClickedPosition(index);
                }}
              >
                <PlusLg size={15} color="#fff" />
              </PlusButton>
              <ConnectorContainer>
                <Connector />
              </ConnectorContainer>
              <Action
                action={action}
                index={index}
                onClickAction={onClickAction}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
              />
              <ConnectorContainer>
                <Connector />
              </ConnectorContainer>
              {index === actions.length - 1 && (
                <PlusButton
                  onClick={() => {
                    setEditAction(false);
                    setClickedPosition(index + 1);
                    setIsOpen(true);
                  }}
                >
                  <PlusLg size={15} color="#fff" />
                </PlusButton>
              )}
            </div>
          ))}
        </div>
      )}
      {mode === "code" && <CodePreview />}
      <NewActionModal
        onClose={close}
        isOpen={isOpen}
        onAdd={(item: Pipeline) => {
          setIsSetupActionModalOpen(true);
          setSelectedAction(item);
        }}
      />
      <SetupActionModal
        onClose={() => setIsSetupActionModalOpen(false)}
        isOpen={isSetupActionModalOpen}
        onAddThisAction={onAddNewAction}
        selectedAction={selectedAction!}
        editAction={editAction}
        actionPosition={actionPosition}
        onSaveChanges={() => {
          setIsSetupActionModalOpen(false);
        }}
      />
    </div>
  );
};

Composer.defaultProps = {
  actions: [],
};

export default Composer;
