import { Action } from "../server/graphql/objects/action.ts";
import aws from "./aws/generate.ts";
import azure from "./azure/generate.ts";
import circleci from "./circleci/generate.ts";
import github from "./github/generate.ts";
import gitlab from "./gitlab/generate.ts";

export type Platform = "aws" | "azure" | "circleci" | "github" | "gitlab";

export default function (platform: Platform, actions: Action[]) {
  switch (platform) {
    case "aws":
      return aws(actions);
    case "azure":
      return azure(actions);
    case "circleci":
      return circleci(actions);
    case "github":
      return github(actions);
    case "gitlab":
      return gitlab(actions);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}
