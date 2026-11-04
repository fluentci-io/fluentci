import { FC, useState } from "react";
import General from "./General";
import _ from "lodash";
import { useUpdateProjectMutation } from "../../../../../Hooks/GraphQL";
import { useRecoilState, useRecoilValue } from "recoil";
import { AuthState } from "../../../../Auth/AuthState";
import { ProjectState } from "../../../ProjectState";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { schema } from "../schema";

const GeneralWithData: FC = () => {
  const [updateProject] = useUpdateProjectMutation();
  const [loading, setLoading] = useState<boolean>(false);
  const me = useRecoilValue(AuthState);
  const [{ project }, setProject] = useRecoilState(ProjectState);
  const methods = useForm({
    mode: "onChange",
    resolver: zodResolver(schema),
    defaultValues: {
      name: project?.displayName || project?.name,
      description: project?.description,
      tags: _.get(project, "tags", [])?.join(", "),
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onSubmit: any = (data: any) => {
    setLoading(true);
    updateProject({
      variables: {
        id: project!.id,
        name: data.name,
        description: data.description,
        tags: data.tags,
      },
    })
      .then(({ data }) => {
        setProject({ project: data?.updateProject });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  return (
    <FormProvider {...methods}>
      <General
        handleSubmit={methods.handleSubmit(onSubmit)}
        me={me}
        loading={loading}
      />
    </FormProvider>
  );
};

export default GeneralWithData;
