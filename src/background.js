// background.js
// Handles PDF export via Chrome Debugger API (Page.printToPDF).
// No telemetry. No external connections. No paywall.

const PAPER_SIZES = {
  a4: { width: 8.27, height: 11.69 },
  a5: { width: 5.83, height: 8.27 },
  letter: { width: 8.5, height: 11 },
};

/**
 * Attaches the debugger to a tab, sends Page.printToPDF,
 * triggers a chrome.downloads.download, then detaches.
 */
async function printTabToPDF(tabId, options = {}) {
  const target = { tabId };

  const sendCommand = (method, params = {}) =>
    new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(target, method, params, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });

  const detach = () => {
    try {
      chrome.debugger.detach(target, () => {});
    } catch (_) {}
  };

  // Attach debugger
  await new Promise((resolve, reject) => {
    chrome.debugger.attach(target, "1.3", () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });

  try {
    await sendCommand("Page.enable");

    const paper = PAPER_SIZES[options.paperSize || "a4"];
    const landscape = options.landscape === true;

    const pdfParams = {
      printBackground: true,
      displayHeaderFooter: false,
      landscape,
      paperWidth: landscape ? paper.height : paper.width,
      paperHeight: landscape ? paper.width : paper.height,
      marginTop: options.margin ?? 0.4,
      marginBottom: options.margin ?? 0.4,
      marginLeft: options.margin ?? 0.4,
      marginRight: options.margin ?? 0.4,
      scale: options.scale ?? 1,
      pageRanges: options.pageRanges || "",
    };

    const { data } = await sendCommand("Page.printToPDF", pdfParams);

    const filename =
      options.filename ||
      `deepseek-chat-${new Date().toISOString().split("T")[0]}.pdf`;

    await new Promise((resolve, reject) => {
      chrome.downloads.download(
        {
          url: `data:application/pdf;base64,${data}`,
          filename,
          saveAs: false,
          conflictAction: "uniquify",
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(downloadId);
          }
        }
      );
    });

    detach();
    return { ok: true };
  } catch (err) {
    detach();
    return { ok: false, error: err.message };
  }
}

// Message handler from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "EXPORT_PDF") return;

  const tabId = message.tabId || sender.tab?.id;
  if (!tabId) {
    sendResponse({ ok: false, error: "No tab ID" });
    return;
  }

  printTabToPDF(tabId, message.options)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true; // keep channel open for async response
});
