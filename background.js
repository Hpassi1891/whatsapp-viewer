chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: "viewer.html" });
});