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
        // Body zaten string ise decode etmeye çalışma
        let decodedBody = body;
        
        // Base64 encode edilmiş gibi görünüyorsa decode et
        if (typeof body === 'string' && !body.startsWith('{')) {
          try {
            decodedBody = atob(body);
          } catch (decodeError) {
            // atob başarısız olursa body'yi olduğu gibi kullan
            decodedBody = body;
          }
        }
        
        body = decodedBody;
        const bodyObj = JSON.parse(decodedBody);
        if (bodyObj.event) {
          eventType = bodyObj.event;
          if (eventType === 'pageView' && bodyObj.page_type) {
            pageType = bodyObj.page_type;
          }
        }
      } catch (e) {
        // JSON parse da başarısız olursa sessizce devam et
      }
    }
    
    try {
      chrome.storage.local.get([storageKey], (result) => {
        if (chrome.runtime.lastError) return;
        
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
    } catch (e) {
      // Extension context invalidated - ignore
    }
  }
  
  if (event.data.type === 'UCD_SESSION_EXPIRE') {
    const { timestamp, sessionExpire } = event.data.data;
    
    try {
      chrome.storage.local.get(['ucdRequests'], (result) => {
        if (chrome.runtime.lastError) return;
        
        const requests = result.ucdRequests || [];
        const requestIndex = requests.findIndex(req => req.timestamp === timestamp);
        
        if (requestIndex !== -1) {
          requests[requestIndex].sessionExpire = sessionExpire;
          chrome.storage.local.set({ ucdRequests: requests });
          console.log('Session expire updated for UCD request:', sessionExpire);
        }
      });
    } catch (e) {
      // Extension context invalidated - ignore
    }
  }
  
  if (event.data.type === 'ADD_TO_CART_INTERCEPTED') {
    const { productId, product, timestamp } = event.data.data;
    
    try {
      chrome.storage.local.get(['addToCartRequests'], (result) => {
        if (chrome.runtime.lastError) return;
        
        const requests = result.addToCartRequests || [];
        requests.push({
          productId: productId,
          product: product,
          timestamp: timestamp,
          timeString: new Date(timestamp).toLocaleString()
        });
        
        chrome.storage.local.set({ addToCartRequests: requests });
      });
    } catch (e) {
      // Extension context invalidated - ignore
    }
  }
  
  if (event.data.type === 'GENERATE_TIME_RESPONSE') {
    const { generateTime } = event.data.data;
    try {
      chrome.storage.local.set({ insiderGenerateTime: generateTime });
    } catch (e) {
      // Extension context invalidated - ignore
    }
  }
});

if (window === window.top) {
  chrome.storage.local.set({ 
    recommendationRequests: [],
    hitRequests: [],
    ucdRequests: [],
    addToCartRequests: []
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RESET_UCD_SEGMENTS') {
    window.postMessage({ type: 'RESET_UCD_SEGMENTS' }, '*');
    sendResponse({ success: true });
  }
  
  if (message.type === 'TOGGLE_ADD_TO_CART_TRACKING') {
    window.postMessage({ type: 'TOGGLE_ADD_TO_CART_TRACKING', enabled: message.enabled }, '*');
    sendResponse({ success: true });
  }
  
  if (message.type === 'GET_GENERATE_TIME') {
    window.postMessage({ type: 'GET_GENERATE_TIME' }, '*');
    sendResponse({ success: true });
  }
  
  return true;
});
