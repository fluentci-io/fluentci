import { FC } from "react";
import ContentLoader from "react-content-loader";

const Loader: FC = (props) => {
  return (
    <ContentLoader
      viewBox="0 0 778 116"
      backgroundColor="#1207326a"
      foregroundColor="#21163f"
      {...props}
    >
      <rect x="37" y="34" rx="0" ry="0" width="0" height="0" />
      <rect x="28" y="29" rx="0" ry="0" width="258" height="32" />
      <rect x="28" y="71" rx="0" ry="0" width="465" height="32" />
      <rect x="434" y="94" rx="0" ry="0" width="0" height="0" />
      <rect x="29" y="116" rx="0" ry="0" width="749" height="32" />
    </ContentLoader>
  );
};

export default Loader;
