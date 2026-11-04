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

export type DeleteTokenModalProps = {
  token: { id: string; name: string; token: string } | null;
  isOpen: boolean;
  close: () => void;
  onDeleteToken: () => Promise<void>;
};

const DeleteTokenModal: FC<DeleteTokenModalProps> = (props) => {
  const { isOpen, close, token, onDeleteToken } = props;

  return (
    <Modal onClose={close} isOpen={isOpen} overrides={styles.Modal}>
      <ModalHeader>
        <ModalTitle>Confirm delete</ModalTitle>
      </ModalHeader>
      <ModalBody style={{ fontFamily: "Lexend" }}>
        This action cannot be undone. Are you sure you want to delete "
        {token?.name}" token?
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
          onClick={onDeleteToken}
          size={SIZE.compact}
          overrides={{
            BaseButton: {
              style: {
                fontFamily: "Lexend",
                backgroundColor: "#FF0000",
                ":hover": {
                  backgroundColor: "#FF0000",
                },
              },
            },
          }}
        >
          Delete
        </ModalButton>
      </ModalFooter>
    </Modal>
  );
};

export default DeleteTokenModal;
