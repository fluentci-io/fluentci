import { FC } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalButton,
} from "baseui/modal";
import { SIZE } from "baseui/button";
import styles, { ModalTitle } from "./styles";

export type ConfirmProjectVisibiltyModalProps = {
  isOpen: boolean;
  close: () => void;
  onChangeVisibility: () => void;
  isPublic: boolean;
};

const ConfirmProjectVisibiltyModal: FC<ConfirmProjectVisibiltyModalProps> = (
  props
) => {
  const { isOpen, close, onChangeVisibility, isPublic } = props;

  return (
    <Modal onClose={close} isOpen={isOpen} overrides={styles.Modal}>
      <ModalHeader>
        <ModalTitle>Are you sure?</ModalTitle>
      </ModalHeader>
      <ModalBody style={{ fontFamily: "Lexend" }}>
        {isPublic && (
          <div>
            Only you and collaborators will be able to see this pipeline.
          </div>
        )}
        {!isPublic && (
          <div>
            All pipeline runs, run logs, environment variables, as well as any
            build artifacts will be visible by anyone, including people who are
            not logged in to FluentCI — this applies to both new and historical
            runs!
            <br />
            <br />
            If your pipeline has historical runs, you should verify that the
            past runs do not expose sensitive information in their logs or
            environment variables.
            <br />
            <br />
            Public pipelines can be made private again at any time on this
            screen.
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <ModalButton
          kind="tertiary"
          onClick={close}
          size={SIZE.compact}
          style={{ fontFamily: "Lexend", backgroundColor: "initial" }}
        >
          Cancel
        </ModalButton>
        <ModalButton
          onClick={() => onChangeVisibility()}
          size={SIZE.compact}
          overrides={{
            BaseButton: {
              style: {
                fontFamily: "Lexend",
              },
            },
          }}
        >
          Make Pipeline {isPublic ? "Private" : "Public"}
        </ModalButton>
      </ModalFooter>
    </Modal>
  );
};

export default ConfirmProjectVisibiltyModal;
