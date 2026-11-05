declare global {
  interface Window {
    __FLUENTCI_DESKTOP__?: boolean;
    __FLUENTCI_MACOS__?: boolean;
  }
}

export const isDesktop = () => window.__FLUENTCI_DESKTOP__ === true;

export const isMacDesktop = () =>
  isDesktop() && window.__FLUENTCI_MACOS__ === true;

export function openDesktopProject() {
  window.location.href = "fluentci-desktop://open-project";
}
