import { FC, useEffect } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-yaml";
import "prismjs/themes/prism-funky.css";
import PlateformSelect from "./PlateformSelect";
import Menu from "./Menu";

export type CodePreviewProps = {
  code: string;
};

const CodePreview: FC<CodePreviewProps> = ({ code }) => {
  useEffect(() => {
    Prism.highlightAll();
  }, [code]);

  return (
    <>
      <PlateformSelect />
      <div className="Code" style={{ marginTop: 50 }}>
        <pre style={{ position: "relative" }}>
          <Menu />
          <code className="language-yaml">{code}</code>
        </pre>
      </div>
    </>
  );
};

export default CodePreview;
