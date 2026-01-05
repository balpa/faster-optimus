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

      window.postMessage({
        type: 'XHR_INTERCEPTED',
        data: responseData
      }, '*');
      
      if (isUcd) {
        setTimeout(() => {
          try {
            const sessionExpire = window.Insider?.storage?.session?.get('ins-uss') || sessionStorage.getItem('ins-uss');
            
            window.postMessage({
              type: 'UCD_SESSION_EXPIRE',
              data: {
                timestamp: requestData.timestamp,
                sessionExpire: sessionExpire
              }
            }, '*');
          } catch (e) {}
        }, 2000);
      }
    });
  }

  return originalXHRSend.apply(this, arguments);
};

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'RESET_UCD_SEGMENTS') {
    try {
      if (window.Insider?.storage?.session?.remove) {
        window.Insider.storage.session.remove('ins-uss');
      } else {
        sessionStorage.removeItem('ins-uss');
      }
    } catch (e) {}
  }
  
  if (event.data.type === 'TOGGLE_ADD_TO_CART_TRACKING') {
    window.insiderTrackAddToCart = event.data.enabled;
    
    if (event.data.enabled && !window.insiderAddToCartHooked) {
      installAddToCartHook();
    }
  }
  
  if (event.data.type === 'GET_GENERATE_TIME') {
    try {
      const generateTime = window.Insider?.generateTime;
      window.postMessage({
        type: 'GENERATE_TIME_RESPONSE',
        data: {
          generateTime: generateTime || null
        }
      }, '*');
    } catch (e) {
      // Ignore error
    }
  }
  
  if (event.data.type === 'GET_ERROR_BAG') {
    try {
      const errors = window.Insider?.errorBag?._errors || [];
      window.postMessage({
        type: 'ERROR_BAG_RESPONSE',
        data: {
          errorCount: errors.length
        }
      }, '*');
    } catch (e) {}
  }
  
  if (event.data.type === 'SHOW_ERROR_BAG') {
    try {
        if (window.Insider?.errorBag?._errors) {
            console.log(window.Insider?.errorBag?._errors);
        }
    } catch (e) {}
  }
});

const installAddToCartHook = () => {
  if (window.insiderAddToCartHooked) return;
  
  const checkInterval = setInterval(() => {
    if (window.Insider?.systemRules?.spAddToCart) {
      clearInterval(checkInterval);
      window.insiderAddToCartHooked = true;
      
      const originalSpAddToCart = window.Insider.systemRules.spAddToCart;
      
      window.Insider.systemRules.spAddToCart = function() {
        const result = originalSpAddToCart.apply(this, arguments);
        
        if (result && result.addToBasket) {
          const originalAddToBasket = result.addToBasket;
          
          result.addToBasket = function(productId, callback, payload) {
            if (window.insiderTrackAddToCart) {
              window.postMessage({
                type: 'ADD_TO_CART_INTERCEPTED',
                data: {
                  productId: productId,
                  product: payload?.product || payload,
                  timestamp: Date.now()
                }
              }, '*');
            }
            
            return originalAddToBasket.apply(this, arguments);
          };
        }
        
        return result;
      };
    }
  }, 100);
  
  setTimeout(() => clearInterval(checkInterval), 10000);
};

