import { gql } from "@apollo/client";
import { RunFragment } from "../Fragment";

export const RUN_PIPELNE = gql`
  mutation RunPipeline($projectId: ID!) {
    runPipeline(projectId: $projectId) {
      ...RunFragment
    }
  }
  ${RunFragment}
`;

export const CANCEL_RUN = gql`
  mutation CancelRun($id: ID!) {
    cancelRun(id: $id) {
      ...RunFragment
    }
  }
  ${RunFragment}
`;
