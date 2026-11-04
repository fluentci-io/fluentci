import { gql } from "@apollo/client";
import { JobFragment } from "../Fragment";

export const GET_JOBS = gql`
  query GetJobs {
    jobs {
      ...JobFragment
    }
  }
  ${JobFragment}
`;

export const GET_JOB = gql`
  query GetJob($id: ID) {
    job(id: $id) {
      id
      name
      status
      createdAt
      duration
      logs {
        id
        message
        createdAt
      }
    }
  }
`;
