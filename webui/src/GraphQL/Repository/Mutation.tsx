import { gql } from "@apollo/client";
import { RepositoryFragment } from "../Fragment";

export const LINK_REPOSITORY = gql`
  mutation LinkRepository($projectId: ID!, $repoName: String!) {
    linkRepository(projectId: $projectId, repoName: $repoName) {
      ...RepositoryFragment
    }
  }
  ${RepositoryFragment}
`;

export const UNLINK_REPOSITORY = gql`
  mutation UnlinkRepository($repoName: String!) {
    unlinkRepository(repoName: $repoName) {
      ...RepositoryFragment
    }
  }
  ${RepositoryFragment}
`;
