import { FC, useState } from "react";
import { Button, SIZE } from "baseui/button";
import { Drawer, ANCHOR } from "baseui/drawer";
import { Plan, Title } from "./styles";

const Billing: FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const close = () => {
    setIsOpen(false);
  };
  return (
    <>
      <div>This organization is currently on plan:</div>
      <Plan>FREE</Plan>
      {false && (
        <Button onClick={() => setIsOpen(true)} size={SIZE.compact}>
          Change subscription plan
        </Button>
      )}
      <Drawer onClose={close} isOpen={isOpen} anchor={ANCHOR.right}>
        <Title>Change subscription Plan</Title>
      </Drawer>
    </>
  );
};

export default Billing;
