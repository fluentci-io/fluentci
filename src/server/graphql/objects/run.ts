import { Job } from "./job.ts";

export class Run {
  id: string;
  name: string;
  title: string;
  message?: string;
  branch?: string;
  duration: number;
  date: string;
  jobs: Job[];

  constructor({ id, name, title, message, branch, duration, date, jobs }: Run) {
    this.id = id;
    this.name = name;
    this.title = title;
    this.message = message;
    this.branch = branch;
    this.duration = duration;
    this.date = date;
    this.jobs = jobs;
  }
}
