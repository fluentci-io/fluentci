import { gql } from "@apollo/client";

export const GET_ACCESS_TOKENS = gql`
  query GetAccessTokens {
    accessTokens {
      id
      name
      token
      created
    }
  }
`;
