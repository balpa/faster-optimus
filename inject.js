const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url, ...args) {
  this._method = method;
  this._url = url;
  return originalXHROpen.apply(this, [method, url, ...args]);
};

XMLHttpRequest.prototype.send = function(body) {
  if (this._url && this._url.includes('recommendationv2.api.useinsider.com')) {
    const requestData = {
      url: this._url,
      method: this._method,
      body: body,
      timestamp: Date.now()
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
    });
  }

  return originalXHRSend.apply(this, arguments);
};
