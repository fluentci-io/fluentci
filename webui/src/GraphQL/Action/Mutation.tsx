import { gql } from "@apollo/client";
import { ActionFragment } from "../Fragment";

export const SAVE_ACTIONS = gql`
  mutation SaveActions($projectId: ID!, $actions: [ActionInput!]!) {
    saveActions(projectId: $projectId, actions: $actions) {
      ...ActionFragment
    }
  }
  ${ActionFragment}
`;
