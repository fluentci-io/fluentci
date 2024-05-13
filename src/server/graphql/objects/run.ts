import { Job } from "./job.ts";

export class Run {
  id: string;
  name: string;
  project: string;
  projectId: string;
  title: string;
  message?: string;
  commit?: string;
  author?: string;
  branch?: string;
  duration: number;
  date: string;
  jobs: Job[];
  cursor?: string;
  status?: string;

  constructor({
    id,
    name,
    project,
    projectId,
    title,
    message,
    commit,
    author,
    branch,
    duration,
    date,
    jobs,
    cursor,
    status,
  }: Run) {
    this.id = id;
    this.name = name;
    this.project = project;
    this.projectId = projectId;
    this.title = title;
    this.message = message;
    this.commit = commit;
    this.author = author;
    this.branch = branch;
    this.duration = duration;
    this.date = date;
    this.jobs = jobs;
    this.cursor = cursor;
    this.status = status;
  }
}
