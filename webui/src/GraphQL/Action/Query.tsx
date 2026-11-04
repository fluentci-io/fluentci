import { gql } from "@apollo/client";
import { ActionFragment } from "../Fragment";

export const GET_ACTIONS = gql`
  query GetActions($projectId: ID!) {
    actions(projectId: $projectId) {
      ...ActionFragment
    }
  }
  ${ActionFragment}
`;

export const EXPORT_ACTIONS = gql`
  query ExportActions($projectId: ID!, $plateform: String!) {
    exportActions(projectId: $projectId, plateform: $plateform)
  }
`;
