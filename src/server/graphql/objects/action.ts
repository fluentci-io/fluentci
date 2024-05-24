export class Action {
  id?: string;
  name: string;
  commands: string;
  enabled: boolean;
  plugin: string;
  useWasm: boolean;
  logo?: string | null;
  githubUrl?: string | null;

  constructor({
    id,
    name,
    commands,
    enabled,
    plugin,
    useWasm,
    logo,
    githubUrl,
  }: Action) {
    this.id = id;
    this.name = name;
    this.commands = commands;
    this.enabled = enabled;
    this.plugin = plugin;
    this.useWasm = useWasm;
    this.logo = logo;
    this.githubUrl = githubUrl;
  }
}
