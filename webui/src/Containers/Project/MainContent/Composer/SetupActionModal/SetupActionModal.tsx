import { BaseSyntheticEvent, FC, useState } from "react";
import { Modal, ModalBody } from "baseui/modal";
import { Tabs, Tab } from "baseui/tabs-motion";
import { PackageIcon } from "@styled-icons/feather";
import { Play, Options } from "@styled-icons/fluentui-system-regular";
import { Variable } from "@styled-icons/heroicons-outline";
import { Pipeline } from "../NewActionModal/NewActionModalWithData";
import { Button } from "./styles";
import styles from "./styles";
import Commands from "./Commands";
import OptionsTab from "./OptionsTab";
import ModuleSettingsTab from "./ModuleSettingsTab";
import Variables from "./VariablesTab";
import { useFormContext } from "react-hook-form";

export type SetupActionModalProps = {
  onClose: () => void;
  onAddThisAction: (action: Pipeline) => void;
  onSaveChanges: (action: Pipeline) => void;
  isOpen: boolean;
  selectedAction: Pipeline;
  editAction: boolean;
  handleSubmit: (e: BaseSyntheticEvent) => void;
  actionPosition?: number | null;
  disabled?: boolean;
};

const SetupActionModal: FC<SetupActionModalProps> = (props) => {
  const {
    onClose,
    onAddThisAction,
    isOpen,
    selectedAction,
    handleSubmit,
    editAction,
    actionPosition,
  } = props;
  const [activeKey, setActiveKey] = useState("0");
  const { watch } = useFormContext();
  const actionName = watch("name");
  const command = watch("commands");
  const useWasmPlugin = watch("useWasmPlugin");

  return (
    <Modal
      autoFocus
      onClose={() => {
        onClose();
        setActiveKey("0");
      }}
      isOpen={isOpen}
      size={"auto"}
      overrides={styles.Modal}
    >
      <ModalBody
        style={{
          margin: 0,
        }}
      >
        <div
          style={{
            height: "70vh",
            width: "60vw",
            color: "#fff",
            fontFamily: "Lexend",
            padding: 20,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              height: "calc(100% - 40px)",
            }}
          >
            <Tabs
              activeKey={activeKey}
              onChange={({ activeKey }) => {
                setActiveKey(activeKey.toString());
              }}
              activateOnFocus
              overrides={styles.Tab}
            >
              <Tab
                title={
                  <>
                    <Play size={24} />
                    <span style={{ marginLeft: 15 }}>Run</span>
                  </>
                }
                overrides={styles.Tab}
              >
                <Commands />
              </Tab>
              <Tab
                title={
                  <>
                    <PackageIcon size={24} />
                    <span style={{ marginLeft: 15 }}>
                      {selectedAction?.name.replace("_pipeline", "")}
                    </span>
                  </>
                }
                overrides={styles.Tab}
              >
                <ModuleSettingsTab
                  plugin={selectedAction}
                  actionPosition={actionPosition}
                />
              </Tab>
              {false && (
                <Tab
                  title={
                    <>
                      <Variable size={24} />
                      <span style={{ marginLeft: 15 }}>Variables</span>
                    </>
                  }
                  overrides={styles.Tab}
                >
                  <Variables />
                </Tab>
              )}
              <Tab
                title={
                  <>
                    <Options size={24} />
                    <span style={{ marginLeft: 15 }}>Options</span>
                  </>
                }
                overrides={styles.Tab}
              >
                <OptionsTab />
              </Tab>
            </Tabs>
          </div>
          <>
            {!editAction && (
              <Button
                onClick={(e: BaseSyntheticEvent) => {
                  if (!actionName || !command) {
                    return;
                  }
                  setActiveKey("0");
                  onAddThisAction({
                    ...selectedAction,
                    actionName,
                    useWasmPlugin,
                    command,
                    active: true,
                  });
                  handleSubmit(e);
                }}
                disabled={props.disabled}
              >
                Add this action
              </Button>
            )}
            {editAction && (
              <Button
                onClick={(e) => {
                  if (!actionName || !command) {
                    return;
                  }
                  setActiveKey("0");
                  handleSubmit(e);
                }}
                disabled={props.disabled}
              >
                Save changes
              </Button>
            )}
          </>
        </div>
      </ModalBody>
    </Modal>
  );
};

export default SetupActionModal;
