import { gql } from "@apollo/client";
import { PackageFragment } from "../Fragment";

export const STAR_PACKAGE = gql`
  mutation StarPackage($id: ID!) {
    starPackage(id: $id) {
      ...PackageFragment
    }
  }
  ${PackageFragment}
`;

export const UNSTAR_PACKAGE = gql`
  mutation UnstarPackage($id: ID!) {
    unstarPackage(id: $id) {
      ...PackageFragment
    }
  }
  ${PackageFragment}
`;
