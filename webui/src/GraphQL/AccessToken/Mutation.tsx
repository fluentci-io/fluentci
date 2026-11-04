import { gql } from "@apollo/client";
import { AccessTokenFragment } from "../Fragment";

export const CREATE_ACCESS_TOKEN = gql`
  mutation CreateAccessToken($name: String!) {
    createAccessToken(name: $name) {
      ...AccessTokenFragment
    }
  }
  ${AccessTokenFragment}
`;

export const DELETE_ACCESS_TOKEN = gql`
  mutation DeleteAccessToken($id: ID!) {
    deleteAccessToken(id: $id)
  }
`;
