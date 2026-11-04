import { gql } from "@apollo/client";
import { OrganizationFragment } from "../Fragment";

export const CREATE_ORGANIZATION = gql`
  mutation CreateOrganization($name: String!) {
    createOrganization(name: $name) {
      ...OrganizationFragment
    }
  }
  ${OrganizationFragment}
`;
