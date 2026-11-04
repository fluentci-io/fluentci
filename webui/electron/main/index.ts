/* eslint-disable @typescript-eslint/no-unused-vars */
import { app, BrowserWindow, shell, ipcMain } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { update } from "./update";
import { execSync, spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, "../..");

export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith("6.1")) app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === "win32") app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win: BrowserWindow | null = null;
const preload = path.join(__dirname, "../preload/index.mjs");
const indexHtml = path.join(RENDERER_DIST, "index.html");

let child;

async function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC!, "favicon.ico"),
    frame: false, // Disable the default window frame.
    transparent: true, // Make the window transparent.
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    // #298
    win.loadURL(VITE_DEV_SERVER_URL);
    // Open devTool if the app is not packaged
    win.webContents.openDevTools();
  } else {
    win.loadFile(indexHtml);
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());

    new Promise((resolve, reject) => {
      win?.webContents.send("setup-pkgx", {
        message: "Setting up pkgx...",
        done: false,
      });
      execSync(
        "bash -c 'type pkgx >/dev/null 2>&1 || curl -Ssf https://pkgx.sh/$(uname)/$(uname -m).tgz | tar xz -C $HOME/.local/bin'",
        {
          env: {
            ...process.env,
            PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
          },
          stdio: "inherit",
        }
      );
      win?.webContents.send("setup-pkgx", {
        message: "Setting up pkgx... Done",
        done: true,
      });

      win?.webContents.send("setup-deno", {
        message: "Setting up Deno...",
        done: false,
      });
      execSync("pkgx deno --version", {
        stdio: "inherit",
        env: {
          ...process.env,
          PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
        },
      });
      win?.webContents.send("setup-deno", {
        message: "Setting up Deno... Done",
        done: true,
      });

      child = spawn(
        "pkgx",
        [
          "deno",
          "run",
          "-A",
          "--unstable-kv",
          "--import-map=https://deno.land/x/fluentci/import_map.json",
          "https://deno.land/x/fluentci/main.ts",
          "server",
        ],
        {
          stdio: "inherit",
          env: {
            ...process.env,
            PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
          },
        }
      );
    });
  });

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });

  // win.setMenuBarVisibility(false);
  // win.autoHideMenuBar = true;
  win.maximize();

  // Auto update
  update(win);
}

app.whenReady().then(createWindow);

app.on("web-contents-created", () => {});

app.on("before-quit", () => {
  if (child) {
    // Kill the child process
    child.kill("SIGKILL");
  }
});

app.on("window-all-closed", () => {
  win = null;
  if (process.platform !== "darwin") app.quit();
});

app.on("second-instance", () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on("activate", () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});

// New window example arg: new windows url
ipcMain.handle("open-win", (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`);
  } else {
    childWindow.loadFile(indexHtml, { hash: arg });
  }
});

ipcMain.on("window-control", (event, action) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (action === "minimize") {
    window?.minimize();
  } else if (action === "maximize") {
    window?.isMaximized() ? window?.unmaximize() : window?.maximize();
  } else if (action === "close") {
    window?.close();
  }
});
