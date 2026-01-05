const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'XHR_INTERCEPTED') {
    const responseData = event.data.data;
    const requestType = responseData.type || 'recommendation';
    const storageKey = requestType === 'recommendation' ? 'recommendationRequests' : (requestType === 'hit' ? 'hitRequests' : 'ucdRequests');
    
    let body = responseData.body;
    let eventType = null;
    let pageType = null;
    
    if (requestType === 'hit' && body) {
      try {
        const decodedBody = atob(body);
        body = decodedBody;
        const bodyObj = JSON.parse(decodedBody);
        if (bodyObj.event) {
          eventType = bodyObj.event;
          if (eventType === 'pageView' && bodyObj.page_type) {
            pageType = bodyObj.page_type;
          }
        }
      } catch (e) {
        console.log('Failed to decode hit body:', e);
      }
    }
    
    chrome.storage.local.get([storageKey], (result) => {
      const requests = result[storageKey] || [];
      requests.push({
        url: responseData.url,
        method: responseData.method,
        status: responseData.status,
        body: body,
        eventType: eventType,
        pageType: pageType,
        response: responseData.response,
        timestamp: responseData.timestamp,
        timeString: new Date(responseData.timestamp).toLocaleString()
      });
      
      chrome.storage.local.set({ [storageKey]: requests });
    });
  }
  
  if (event.data.type === 'UCD_SESSION_EXPIRE') {
    const { timestamp, sessionExpire } = event.data.data;
    
    chrome.storage.local.get(['ucdRequests'], (result) => {
      const requests = result.ucdRequests || [];
      const requestIndex = requests.findIndex(req => req.timestamp === timestamp);
      
      if (requestIndex !== -1) {
        requests[requestIndex].sessionExpire = sessionExpire;
        chrome.storage.local.set({ ucdRequests: requests });
        console.log('Session expire updated for UCD request:', sessionExpire);
      }
    });
  }
});

if (window === window.top) {
  chrome.storage.local.set({ 
    recommendationRequests: [],
    hitRequests: [],
    ucdRequests: []
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RESET_UCD_SEGMENTS') {
    window.postMessage({ type: 'RESET_UCD_SEGMENTS' }, '*');
    sendResponse({ success: true });
  }
  return true;
});
