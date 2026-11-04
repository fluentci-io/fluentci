import { gql } from "@apollo/client";
import { LogFragment } from "../Fragment";

export const GET_LOGS = gql`
  query GetLogs($projectId: ID, $jobId: ID) {
    logs(projectId: $projectId, jobId: $jobId) {
      ...LogFragment
    }
  }
  ${LogFragment}
`;
