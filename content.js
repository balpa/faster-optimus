const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data.type === 'XHR_INTERCEPTED') {
    const responseData = event.data.data;
    
    chrome.storage.local.get(['apiRequests'], (result) => {
      const requests = result.apiRequests || [];
      requests.push({
        url: responseData.url,
        method: responseData.method,
        status: responseData.status,
        body: responseData.body,
        response: responseData.response,
        timestamp: responseData.timestamp,
        timeString: new Date(responseData.timestamp).toLocaleString()
      });
      
      chrome.storage.local.set({ apiRequests: requests });
    });
  }
});

if (window === window.top) {
  chrome.storage.local.set({ apiRequests: [] });
}
