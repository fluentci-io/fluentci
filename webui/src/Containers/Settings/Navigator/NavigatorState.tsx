import React from "react";
import { atom } from "recoil";

export const navigatorState = atom<{ current: React.Key }>({
  key: "settingsNavigatorState",
  default: {
    current: 0,
  },
});
