import { gql } from "@apollo/client";

export const GET_ME = gql`
  query GetMe {
    me {
      id
      username
      email
      createdAt
      github
      name
      picture
    }
  }
`;

export const GET_ACCOUNT = gql`
  query GetAccount($github: String!) {
    account(github: $github) {
      id
      username
      email
      createdAt
      github
      name
      picture
      company
    }
  }
`;
