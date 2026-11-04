import { FC } from "react";
import { Download } from "@styled-icons/bootstrap";
import { Copy } from "@styled-icons/ionicons-outline";
import { Button, Container } from "./styles";

export type MenuProps = {
  onDownload: () => void;
  onCopy: () => void;
};

const Menu: FC<MenuProps> = ({ onCopy, onDownload }) => {
  return (
    <Container>
      <Button onClick={onCopy}>
        <Copy size={18} />
      </Button>
      <Button onClick={onDownload}>
        <Download size={18} />
      </Button>
    </Container>
  );
};

export default Menu;
