import { FC, useState } from "react";
import { Robot } from "@styled-icons/bootstrap";
import { Drawer } from "baseui/drawer";
import { Container } from "./styles";
import DrawerContent from "./DrawerContent";

const AskAI: FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Drawer
        isOpen={isOpen}
        autoFocus
        onClose={() => setIsOpen(false)}
        overrides={{
          Root: {
            style: {
              zIndex: 2,
              margin: 0,
            },
          },
          DrawerContainer: {
            style: {
              backgroundColor: "#090119",
              color: "#fff",
              margin: "0 !important",
            },
          },
          DrawerBody: {
            style: {
              color: "#fff",
              margin: "0 !important",
              paddingBottom: "0 !important",
              fontFamily: 'Lexend !important',
            },
          },
          Close: {
            style: {
              outline: "none",
            },
          },
        }}
      >
        <DrawerContent />
      </Drawer>
      <Container
        onClick={() => {
          setIsOpen(true);
        }}
      >
        <Robot size={25} style={{ marginTop: -4 }} />
      </Container>
    </>
  );
};

export default AskAI;
