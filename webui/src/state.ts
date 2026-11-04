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
export const actionDraftsAtom = atom<Record<string, Action[]>>({});
