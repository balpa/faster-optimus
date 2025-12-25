const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data.type === 'XHR_INTERCEPTED') {
    const responseData = event.data.data;
    const requestType = responseData.type || 'recommendation';
    const storageKey = requestType === 'recommendation' ? 'recommendationRequests' : 'hitRequests';
    
    chrome.storage.local.get([storageKey], (result) => {
      const requests = result[storageKey] || [];
      requests.push({
        url: responseData.url,
        method: responseData.method,
        status: responseData.status,
        body: responseData.body,
        response: responseData.response,
        timestamp: responseData.timestamp,
        timeString: new Date(responseData.timestamp).toLocaleString()
      });
      
      chrome.storage.local.set({ [storageKey]: requests });
    });
  }
});

if (window === window.top) {
  chrome.storage.local.set({ 
    recommendationRequests: [],
    hitRequests: []
  });
}
