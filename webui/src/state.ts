import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { Action } from "./types";

export const connectionAtom = atom<"connecting" | "live" | "reconnecting">(
  "connecting",
);
export const projectSearchAtom = atom("");
export const followLogsAtom = atomWithStorage("studio.followLogs", true);
export const logSearchAtom = atom("");
export const timestampsAtom = atomWithStorage("studio.timestamps", false);
export const actionDraftRevisionsAtom = atom<Record<string, string>>({});
export const actionDraftsAtom = atom<Record<string, Action[]>>({});

export const workflowDraftKey = (projectId: string, workflowId = "default") =>
  workflowId === "default" ? projectId : `${projectId}:${workflowId}`;

export const workflowSearch = (workflowId = "default") =>
  workflowId === "default" ? "" : `?workflow=${encodeURIComponent(workflowId)}`;
