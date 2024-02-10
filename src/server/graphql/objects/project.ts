export class Project {
  id: string;
  path: string;
  name: string;
  createdAt: string;

  constructor({ id, path, name, createdAt }: Project) {
    this.id = id;
    this.path = path;
    this.name = name;
    this.createdAt = createdAt;
  }
}
