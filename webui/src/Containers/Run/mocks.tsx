export const actions: {
  id: string;
  name: string;
  duration: string;
  status: "SUCCESS" | "FAILURE" | "RUNNING" | "PENDING";
}[] = [
  {
    id: "1",
    name: "Test",
    duration: "5s",
    status: "SUCCESS",
  },
  {
    id: "1",
    name: "Build",
    duration: "3m 46s",
    status: "RUNNING",
  },
  {
    id: "1",
    name: "Deploy",
    duration: "7m 53s",
    status: "PENDING",
  },
];
