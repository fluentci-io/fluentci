import { Job } from "./job.ts";

export class Run {
  id: string;
  name: string;
  title: string;
  message?: string;
  commit?: string;
  author?: string;
  branch?: string;
  duration: number;
  date: string;
  jobs: Job[];
  cursor?: string;

  constructor({
    id,
    name,
    title,
    message,
    commit,
    author,
    branch,
    duration,
    date,
    jobs,
    cursor,
  }: Run) {
    this.id = id;
    this.name = name;
    this.title = title;
    this.message = message;
    this.commit = commit;
    this.author = author;
    this.branch = branch;
    this.duration = duration;
    this.date = date;
    this.jobs = jobs;
    this.cursor = cursor;
  }
}
