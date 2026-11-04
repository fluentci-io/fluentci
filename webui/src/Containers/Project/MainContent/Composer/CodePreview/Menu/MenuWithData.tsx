import Menu from "./Menu";
import { FC } from "react";
import copyToClipboard from "copy-to-clipboard";
import { useRecoilValue } from "recoil";
import { CodePreviewState } from "../CodePreviewState";
import { PlateformSelectState } from "../PlateformSelect/PlateformSelectState";

const MenuWithData: FC = () => {
  const [{ filename }] = useRecoilValue(PlateformSelectState);
  const code = useRecoilValue(CodePreviewState);
  const onCopy = () => {
    copyToClipboard(code);
  };

  const onDownload = () => {
    const blob = new Blob([code], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return <Menu onCopy={onCopy} onDownload={onDownload} />;
};

export default MenuWithData;
