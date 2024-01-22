import { generateYaml } from "./config.ts";

generateYaml().save(".github/workflows/ci.yml");
