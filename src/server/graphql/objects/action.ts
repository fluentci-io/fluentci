export class Action {
  id?: string;
  name: string;
  commands: string;
  enabled: boolean;
  plugin: string;
  useWasm: boolean;
  logo?: string | null;
  githubUrl?: string | null;
  env?: string[] | null;
  workingDirectory?: string | null;

  constructor({
    id,
    name,
    commands,
    enabled,
    plugin,
    useWasm,
    logo,
    githubUrl,
    env,
    workingDirectory,
  }: Action) {
    this.id = id;
    this.name = name;
    this.commands = commands;
    this.enabled = enabled;
    this.plugin = plugin;
    this.useWasm = useWasm;
    this.logo = logo;
    this.githubUrl = githubUrl;
    this.env = env;
    this.workingDirectory = workingDirectory;
  }
}
