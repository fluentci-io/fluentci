import { gql } from "@apollo/client";
import { ProjectFragment } from "../Fragment";

export const CREATE_PROJECT = gql`
  mutation CreateProject($fromRepository: String) {
    createProject(fromRepository: $fromRepository) {
      ...ProjectFragment
    }
  }
  ${ProjectFragment}
`;

export const UPDATE_PROJECT = gql`
  mutation UpdateProject(
    $id: ID!
    $name: String
    $description: String
    $tags: String
  ) {
    updateProject(
      id: $id
      name: $name
      description: $description
      tags: $tags
    ) {
      ...ProjectFragment
    }
  }
  ${ProjectFragment}
`;

export const DELETE_PROJECT = gql`
  mutation DeleteProject($id: ID!) {
    deleteProject(id: $id)
  }
`;

export const ARCHIVE_PROJECT = gql`
  mutation ArchiveProject($id: ID!) {
    archiveProject(id: $id) {
      ...ProjectFragment
    }
  }
  ${ProjectFragment}
`;

export const UNARCHIVE_PROJECT = gql`
  mutation UnarchiveProject($id: ID!) {
    unarchiveProject(id: $id) {
      ...ProjectFragment
    }
  }
  ${ProjectFragment}
`;

export const CHANGE_PROJECT_VISIBILITY = gql`
  mutation ChangeProjectVisibility($id: ID!, $isPublic: Boolean!) {
    changeProjectVisibility(id: $id, isPublic: $isPublic) {
      ...ProjectFragment
    }
  }
  ${ProjectFragment}
`;
