import { gql } from "@apollo/client";
import { RunFragment } from "../Fragment";

export const GET_RUN = gql`
  query GetRun($id: ID!) {
    getRun(id: $id) {
      id
      branch
      commit
      date
      project
      projectId
      duration
      jobs {
        id
        name
        createdAt
        status
        duration
        logs {
          id
          message
          createdAt
        }
        startedAt
      }
      message
      name
      title
      cursor
      status
    }
  }
`;

export const GET_RUNS = gql`
  query GetRuns($projectId: ID!, $cursor: String, $limit: Int, $skip: Int) {
    getRuns(
      projectId: $projectId
      cursor: $cursor
      limit: $limit
      skip: $skip
    ) {
      ...RunFragment
    }
  }
  ${RunFragment}
`;

export const COUNT_RUNS = gql`
  query CountRuns($projectId: ID!) {
    countRuns(projectId: $projectId)
  }
`;
