export class Log {
  id: string;
  jobId?: string;
  message: string;
  createdAt: string;

  constructor({ id, jobId, message, createdAt }: Log) {
    this.id = id;
    this.jobId = jobId;
    this.message = message;
    this.createdAt = createdAt;
  }
}
