const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();

let generateTimeCheckInterval = null;
let generateTimeCheckCount = 0;
let errorBagCheckInterval = null;
let errorBagCheckCount = 0;
const MAX_CHECKS = 20;


if ('PerformanceObserver' in window) {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name.includes('ins.js') && entry.initiatorType === 'script') {
        startInsiderChecks();
        observer.disconnect();
        break;
      }
    }
  });
  
  observer.observe({ entryTypes: ['resource'] });
  
  const scriptObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.tagName === 'SCRIPT' && node.src && node.src.includes('ins.js')) {
          startInsiderChecks();
          scriptObserver.disconnect();
          break;
        }
      }
    }
  });
  
  scriptObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  
  setTimeout(() => {
    const scripts = document.querySelectorAll('script[src*="ins.js"]');
    if (scripts.length > 0) {
      startInsiderChecks();
      observer.disconnect();
      scriptObserver.disconnect();
    }
  }, 1000);
}

function startInsiderChecks() {
  startGenerateTimeChecks();
  startErrorBagChecks();
}

function startGenerateTimeChecks() {
  if (generateTimeCheckInterval) return;
  
  generateTimeCheckCount = 0;
  window.postMessage({ type: 'GET_GENERATE_TIME' }, '*');
  
  generateTimeCheckInterval = setInterval(() => {
    generateTimeCheckCount++;
    
    if (generateTimeCheckCount >= MAX_CHECKS) {
      clearInterval(generateTimeCheckInterval);
      generateTimeCheckInterval = null;
      return;
    }
    
    window.postMessage({ type: 'GET_GENERATE_TIME' }, '*');
  }, 500);
}

function startErrorBagChecks() {
  if (errorBagCheckInterval) return;
  
  errorBagCheckCount = 0;
  window.postMessage({ type: 'GET_ERROR_BAG' }, '*');
  
  errorBagCheckInterval = setInterval(() => {
    errorBagCheckCount++;
    
    if (errorBagCheckCount >= MAX_CHECKS) {
      clearInterval(errorBagCheckInterval);
      errorBagCheckInterval = null;
      return;
    }
    
    window.postMessage({ type: 'GET_ERROR_BAG' }, '*');
  }, 500);
}

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
        let decodedBody = body;
        if (typeof body === 'string' && !body.startsWith('{')) {
          try {
            decodedBody = atob(body);
          } catch (decodeError) {
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
      } catch (e) {}
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
    } catch (e) {}
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
        }
      });
    } catch (e) {}
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
    } catch (e) {}
  }
  
  if (event.data.type === 'GENERATE_TIME_RESPONSE') {
    const { generateTime } = event.data.data;
    try {
      chrome.storage.local.set({ insiderGenerateTime: generateTime });
    } catch (e) {}
  }
  
  if (event.data.type === 'ERROR_BAG_RESPONSE') {
    const { errorCount } = event.data.data;
    try {
      chrome.storage.local.set({ insiderErrorCount: errorCount });
    } catch (e) {}
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
  
  if (message.type === 'GET_ERROR_BAG') {
    window.postMessage({ type: 'GET_ERROR_BAG' }, '*');
    sendResponse({ success: true });
  }
  
  if (message.type === 'SHOW_ERROR_BAG') {
    window.postMessage({ type: 'SHOW_ERROR_BAG' }, '*');
    sendResponse({ success: true });
  }
  
  return true;
});
