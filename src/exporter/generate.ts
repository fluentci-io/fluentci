import { Action } from "../server/graphql/objects/action.ts";
import aws from "./aws/generate.ts";
import azure from "./azure/generate.ts";
import circleci from "./circleci/generate.ts";
import github from "./github/generate.ts";
import gitlab from "./gitlab/generate.ts";

export type Platform = "aws" | "azure" | "circleci" | "github" | "gitlab";

export const plateforms: Record<string, (actions: Action[]) => string> = {
  aws,
  azure,
  circleci,
  github,
  gitlab,
};

export default function (name: Platform, actions: Action[]): string {
  if (!plateforms[name]) {
    throw new Error(`Unsupported platform: ${name}`);
  }
  return plateforms[name](actions);
}
