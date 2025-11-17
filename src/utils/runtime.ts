const PLAYCANVAS_URL_PATTERNS = [
  "https://playcanvas.com/editor/*",
  "http://playcanvas.com/editor/*",
];

async function findEditorTabId(): Promise<number> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) {
    throw new Error("Chrome tabs API is not available");
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.query({ url: PLAYCANVAS_URL_PATTERNS }, (tabs) => {
      const err = chrome.runtime?.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      const targetTab = tabs.find((tab) => typeof tab.id === "number");
      if (!targetTab?.id) {
        reject(
          new Error(
            "No PlayCanvas editor tab detected. Please open https://playcanvas.com/editor"
          )
        );
        return;
      }
      resolve(targetTab.id);
    });
  });
}

export async function sendRuntimeMessage<TResponse>(
  message: any
): Promise<TResponse> {
  const tabId = await findEditorTabId();
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime?.lastError;
      if (err) {
        reject(new Error(err.message));
      } else {
        resolve(response as TResponse);
      }
    });
  });
}
