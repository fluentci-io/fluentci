export class Job {
  id: string;
  projectId: string;
  name: string;
  status: string;
  createdAt: string;

  constructor({ id, projectId, name, status, createdAt }: Job) {
    this.id = id;
    this.projectId = projectId;
    this.name = name;
    this.status = status;
    this.createdAt = createdAt;
  }
}
