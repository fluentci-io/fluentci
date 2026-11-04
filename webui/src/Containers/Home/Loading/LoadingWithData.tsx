import { FC, useEffect, useState } from "react";
import Loading from "./Loading";

const LoadingWithData: FC = () => {
  const [pkgxReady, setPkgxReady] = useState(false);
  const [denoReady, setDenoReady] = useState(false);
  const [hideDeno, setHideDeno] = useState(true);
  const [hidePkgx, setHidePkgx] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ipcRenderer.on(
      "setup-pkgx",
      (data: { message: string; done: boolean }) => {
        setPkgxReady(data.done);
        if (!data.done) {
          setHidePkgx(false);
        }
      }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ipcRenderer.on(
      "setup-deno",
      (data: { message: string; done: boolean }) => {
        setDenoReady(data.done);
        if (!data.done) {
          setHideDeno(false);
        }
      }
    );
  }, []);

  return (
    <Loading
      pkgxReady={pkgxReady}
      denoReady={denoReady}
      hideDeno={hideDeno}
      hidePkgx={hidePkgx}
    />
  );
};

export default LoadingWithData;
