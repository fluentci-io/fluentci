import { gql } from "@apollo/client";
import { RepositoryFragment } from "../Fragment";

export const GET_REPOSITORIES = gql`
  query GetRepositories($provider: String!, $organization: String!) {
    repositories(provider: $provider, organization: $organization) {
      ...RepositoryFragment
    }
  }
  ${RepositoryFragment}
`;

export const GET_LINKED_REPOSITORY = gql`
  query GetLinkedRepository($projectId: ID!) {
    linkedRepository(projectId: $projectId) {
      ...RepositoryFragment
    }
  }
  ${RepositoryFragment}
`;
