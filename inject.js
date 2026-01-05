const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url, ...args) {
  this._method = method;
  this._url = url;
  return originalXHROpen.apply(this, [method, url, ...args]);
};

XMLHttpRequest.prototype.send = function(body) {
  const isRecommendation = this._url && this._url.includes('recommendationv2.api.useinsider.com');
  const isHit = this._url && this._url.includes('hit.api.useinsider.com/hit');
  const isUcd = this._url && this._url.includes('ucd-web.api.useinsider.com/v1/get');
  
  if (isRecommendation || isHit || isUcd) {
    const requestData = {
      url: this._url,
      method: this._method,
      body: body,
      timestamp: Date.now(),
      type: isRecommendation ? 'recommendation' : (isHit ? 'hit' : 'ucd')
    };

    this.addEventListener('load', function() {
      const responseData = {
        ...requestData,
        status: this.status,
        statusText: this.statusText,
        response: this.responseText
      };

      console.log('API Request Captured:', responseData);

      window.postMessage({
        type: 'XHR_INTERCEPTED',
        data: responseData
      }, '*');
      
      // UCD request için ayrıca session storage'ı da gönder
      if (isUcd) {
        setTimeout(() => {
          try {
            const sessionExpire = window.Insider?.storage?.session?.get('ins-uss') || sessionStorage.getItem('ins-uss');
            console.log('Session Expire Found:', sessionExpire);
            
            window.postMessage({
              type: 'UCD_SESSION_EXPIRE',
              data: {
                timestamp: requestData.timestamp,
                sessionExpire: sessionExpire
              }
            }, '*');
          } catch (e) {
            console.log('Failed to get ins-uss:', e);
          }
        }, 2000);
      }
    });
  }

  return originalXHRSend.apply(this, arguments);
};

// UCD Segments reset mesajını dinle
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'RESET_UCD_SEGMENTS') {
    try {
      if (window.Insider?.storage?.session?.remove) {
        window.Insider.storage.session.remove('ins-uss');
        console.log('UCD Segments reset: ins-uss removed from session storage');
      } else {
        sessionStorage.removeItem('ins-uss');
        console.log('UCD Segments reset: ins-uss removed from sessionStorage');
      }
    } catch (e) {
      console.log('Failed to remove ins-uss:', e);
    }
  }
});
