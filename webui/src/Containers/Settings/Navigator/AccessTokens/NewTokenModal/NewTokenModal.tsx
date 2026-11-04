import { FC, useState } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "baseui/modal";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "baseui/input";
import styles, { Button, Label, ModalTitle } from "./styles";

const validationSchema = z.object({
  name: z.string().min(1),
});

type ValidationSchema = z.infer<typeof validationSchema>;

export type NewTokenModalProps = {
  isOpen: boolean;
  close: () => void;
  onGenerateAccessToken: (name: string) => Promise<string | undefined>;
  setNewToken: (token?: string) => void;
};

const NewTokenModal: FC<NewTokenModalProps> = (props) => {
  const { isOpen, close, onGenerateAccessToken, setNewToken } = props;
  const [invalidName, setInvalidName] = useState(false);
  const { control, reset, watch } = useForm<ValidationSchema>({
    resolver: zodResolver(validationSchema),
    defaultValues: {
      name: "",
    },
  });

  const _close = () => {
    close();
    reset();
    setInvalidName(false);
  };

  const generateToken = async () => {
    const name = watch("name");

    if (!name) {
      setInvalidName(true);
      return;
    }

    onGenerateAccessToken(name)
      .then((token) => setNewToken(token))
      .catch((e) => {
        console.error(e);
      });
    close();
  };

  return (
    <Modal onClose={_close} isOpen={isOpen} overrides={styles.Modal}>
      <ModalHeader>
        <ModalTitle>Generate New Token</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Controller
          render={({ field }) => (
            <>
              <Label>Name</Label>
              <Input
                size="compact"
                placeholder="Provide a name for your token"
                overrides={styles.Input}
                error={invalidName}
                {...field}
              />
            </>
          )}
          name="name"
          control={control}
          rules={{ required: true }}
        />
      </ModalBody>
      <ModalFooter>
        <Button onClick={close} inverted>
          Cancel
        </Button>
        <Button onClick={generateToken}>Generate Token</Button>
      </ModalFooter>
    </Modal>
  );
};

export default NewTokenModal;
