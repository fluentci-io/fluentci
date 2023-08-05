import { green } from "https://deno.land/std@0.192.0/fmt/colors.ts";

async function listJobs(pipeline: string) {}

const displayErrorMessage = () => {
  console.log(
    `This directory does not contain a FluentCI pipeline. Please run ${green(
      "`fluentci init`"
    )} to initialize a new pipeline.`
  );
  Deno.exit(1);
};

export default listJobs;
