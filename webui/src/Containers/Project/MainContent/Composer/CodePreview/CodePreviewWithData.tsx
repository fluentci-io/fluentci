import { FC, useEffect } from "react";
import CodePreview from "./CodePreview";
import { useRecoilState, useRecoilValue } from "recoil";
import { CodePreviewState } from "./CodePreviewState";
import { PlateformSelectState } from "./PlateformSelect/PlateformSelectState";
import { useParams } from "react-router-dom";
import { useExportActionsLazyQuery } from "../../../../../Hooks/GraphQL";
import { ComposerState } from "../ComposerState";

const CodePreviewWithData: FC = () => {
  const { id } = useParams();
  const plateform = useRecoilValue(PlateformSelectState);
  const actions = useRecoilValue(ComposerState);
  const [code, setCode] = useRecoilState(CodePreviewState);
  const [exportActions] = useExportActionsLazyQuery({
    variables: {
      projectId: id!,
      plateform: plateform[0].id,
    },
    fetchPolicy: "cache-and-network",
  });

  useEffect(() => {
    exportActions({
      variables: {
        projectId: id!,
        plateform: plateform[0].id,
      },
      fetchPolicy: "cache-and-network",
    }).then(({ data }) => {
      setCode(data?.exportActions || "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plateform, actions]);

  return <CodePreview code={code} />;
};

export default CodePreviewWithData;
