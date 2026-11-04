/* eslint-disable @typescript-eslint/no-unused-vars */
import { FC } from "react";
import AccessTokens from "./AccessTokens";
import {
  useCreateAccessTokenMutation,
  useDeleteAccessTokenMutation,
  useGetAccessTokensQuery,
} from "../../../../Hooks/GraphQL";
import _ from "lodash";

const AccessTokensWithData: FC = () => {
  const [createAccessToken] = useCreateAccessTokenMutation();
  const [deleteAccessToken] = useDeleteAccessTokenMutation();
  const { data, refetch } = useGetAccessTokensQuery();

  const onGenerateAccessToken = async (name: string) => {
    const response = await createAccessToken({
      variables: {
        name,
      },
    });
    await refetch();
    return response.data?.createAccessToken?.token;
  };

  const onDeleteAccessToken = async (id: string) => {
    await deleteAccessToken({
      variables: {
        id,
      },
    });
    await refetch();
  };

  return (
    <AccessTokens
      onGenerateAccessToken={onGenerateAccessToken}
      onDeleteAccessToken={onDeleteAccessToken}
      tokens={_.get(data, "accessTokens", [])}
    />
  );
};

export default AccessTokensWithData;
