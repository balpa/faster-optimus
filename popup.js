document.addEventListener('DOMContentLoaded', () => {
  loadRequests();
  startPolling();
  
  const errorIndicator = document.getElementById('errorIndicator');
  if (errorIndicator) {
    errorIndicator.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'SHOW_ERROR_BAG' }, () => {
            if (chrome.runtime.lastError) {}
          });
        }
      });
    }, { once: false });
  }
  
  document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.classList.contains('clear-btn-small')) return;
      
      const section = header.parentElement;
      const content = section.querySelector('.section-content');
      const icon = section.querySelector('.section-expand-icon');
      
      content.classList.toggle('expanded');
      icon.textContent = content.classList.contains('expanded') ? '▲' : '▼';
    });
  });
  
  document.getElementById('clearRecommendationBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.storage.local.set({ recommendationRequests: [] }, () => {
      expandedItems.clear();
      expandedSections.clear();
      lastRecommendationCount = 0;
      loadRequests();
    });
  });
  
  document.getElementById('clearHitBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.storage.local.set({ hitRequests: [] }, () => {
      expandedItems.clear();
      expandedSections.clear();
      lastHitCount = 0;
      loadRequests();
    });
  });
  
  document.getElementById('clearUcdBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.storage.local.set({ ucdRequests: [] }, () => {
      expandedItems.clear();
      expandedSections.clear();
      lastUcdCount = 0;
      loadRequests();
    });
  });
  
  document.getElementById('clearAddToCartBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.storage.local.set({ addToCartRequests: [] }, () => {
      expandedItems.clear();
      expandedSections.clear();
      lastAddToCartCount = 0;
      loadRequests();
    });
  });
  
  chrome.storage.local.get(['trackAddToCart'], (result) => {
    const toggle = document.getElementById('trackAddToCartToggle');
    toggle.checked = result.trackAddToCart || false;
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          type: 'TOGGLE_ADD_TO_CART_TRACKING', 
          enabled: toggle.checked 
        }, () => {
          if (chrome.runtime.lastError) {
          }
        });
      }
    });
  });
  
  document.getElementById('trackAddToCartToggle').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.storage.local.set({ trackAddToCart: enabled });
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          type: 'TOGGLE_ADD_TO_CART_TRACKING', 
          enabled: enabled 
        }, () => {
          if (chrome.runtime.lastError) {
          }
        });
      }
    });
  });
  
  updateGenerateTime();
  updateErrorCount();
  
  const partnerNameInput = document.getElementById('partnerNameInput');
  const bringSettingsBtn = document.getElementById('bringSettingsBtn');
  const loginBtn = document.getElementById('loginBtn');
  const partnerError = document.getElementById('partnerError');
  const partnerSettingsOutput = document.getElementById('partnerSettingsOutput');
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PARTNER_NAME' }, (response) => {
        if (chrome.runtime.lastError) {
          return;
        }
        if (response && response.partnerName) {
          partnerNameInput.value = response.partnerName;
        }
      });
    }
  });
  
  partnerNameInput.addEventListener('input', () => {
    partnerError.style.display = 'none';
  });
  
  loginBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://gachapon.useinsider.com/login' });
  });
  
  bringSettingsBtn.addEventListener('click', async () => {
    const partnerName = partnerNameInput.value.trim();
    
    if (!partnerName) {
      showPartnerError('Partner name cannot be empty');
      return;
    }
    
    if (partnerName.length < 2) {
      showPartnerError('Partner name must be at least 2 characters');
      return;
    }
    
    if (partnerName.length > 30) {
      showPartnerError('Partner name cannot exceed 30 characters');
      return;
    }
    
    bringSettingsBtn.disabled = true;
    bringSettingsBtn.textContent = 'Loading...';
    partnerSettingsOutput.innerHTML = '';
    partnerError.style.display = 'none';
    
    try {
      const [accountPreferencesResponse, restrictedSettingsResponse] = await Promise.all([
        fetch(`https://gachapon.useinsider.com/ajax/partner-settings/${partnerName}/account-preferences-settings`, { redirect: 'manual' }),
        fetch(`https://gachapon.useinsider.com/ajax/partner-settings/${partnerName}/restricted-settings`, { redirect: 'manual' })
      ]);
      
      if (accountPreferencesResponse.type === 'opaqueredirect' || restrictedSettingsResponse.type === 'opaqueredirect' ||
          accountPreferencesResponse.status === 302 || restrictedSettingsResponse.status === 302 ||
          accountPreferencesResponse.redirected || restrictedSettingsResponse.redirected) {
        showPartnerError('Authentication required. Please login first.');
        chrome.tabs.create({ url: 'https://gachapon.useinsider.com/login' });
        return;
      }
      
      if (!accountPreferencesResponse.ok || !restrictedSettingsResponse.ok) {
        throw new Error(`HTTP error! status: ${accountPreferencesResponse.status} / ${restrictedSettingsResponse.status}`);
      }
      
      const [accountData, restrictedData] = await Promise.all([
        accountPreferencesResponse.json(),
        restrictedSettingsResponse.json()
      ]);
      
      displayPartnerSettings(accountData, restrictedData);
    } catch (error) {
      showPartnerError(`Failed to fetch partner settings: ${error.message}`);
    } finally {
      bringSettingsBtn.disabled = false;
      bringSettingsBtn.textContent = 'Fetch';
    }
  });
  
  function showPartnerError(message) {
    partnerError.textContent = message;
    partnerError.style.display = 'block';
  }
  
  function displayPartnerSettings(accountData, restrictedData) {
    const partnerId = accountData.partnerId || 'N/A';
    const multiDomainStorageSupport = accountData.multiDomainStorageSupport !== undefined ? accountData.multiDomainStorageSupport : 'N/A';
    const supportedCurrencies = accountData.supportedCurrencies || [];
    const currency = accountData.currency || 'N/A';
    const timezone = accountData.timezone || 'N/A';
    const domainList = accountData.domainList || [];
    const eventCollectionStatus = restrictedData.eventCollectionStatus || {};
    const isNewIOActive = restrictedData.isNewIOActive !== undefined ? String(restrictedData.isNewIOActive) : 'false';
    
    let html = `
      <div class="setting-item">
        <div class="setting-label">Partner ID</div>
        <div class="setting-value">${partnerId}</div>
      </div>
      <div class="setting-item">
        <div class="setting-label">Multi Domain Storage Support</div>
        <div class="setting-value">${multiDomainStorageSupport}</div>
      </div>
      <div class="setting-item">
        <div class="setting-label">Is New IO Active</div>
        <div class="setting-value">${isNewIOActive}</div>
      </div>
      <div class="setting-item">
        <div class="setting-label">Preferred Currency</div>
        <div class="setting-value">${currency}</div>
      </div>
      <div class="setting-item">
        <div class="setting-label">Timezone</div>
        <div class="setting-value">${timezone}</div>
      </div>
    `;
    
    if (Object.keys(eventCollectionStatus).length > 0) {
      html += `
        <div class="setting-item">
          <div class="setting-label">Event Collection Status</div>
          <div class="setting-value">
            ${Object.entries(eventCollectionStatus).map(([key, value]) => `
              <div class="attribute-row">
                <span class="attribute-key">${key}:</span>
                <span class="attribute-value">${value}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
    
    if (supportedCurrencies.length > 0) {
      html += `
        <div class="setting-item">
          <div class="setting-label">Supported Currencies</div>
          <div class="setting-value currency-list">
            ${supportedCurrencies.map(curr => `<span class="currency-badge">${curr}</span>`).join('')}
          </div>
        </div>
      `;
    }
    
    if (domainList.length > 0) {
      html += `
        <div class="setting-item">
          <div class="setting-label">Domain List</div>
          <div class="setting-value currency-list">
            ${domainList.map(domain => `<span class="currency-badge">${domain}</span>`).join('')}
          </div>
        </div>
      `;
    }
    
    partnerSettingsOutput.innerHTML = html;
  }
  
  const base64Input = document.getElementById('base64Input');
  const base64Output = document.getElementById('base64Output');
  const copyDecodedBtn = document.getElementById('copyDecodedBtn');
  
  base64Input.addEventListener('input', (e) => {
    const input = e.target.value.trim();
    
    if (!input) {
      base64Output.innerHTML = '';
      copyDecodedBtn.style.display = 'none';
      return;
    }
    
    try {
      const decoded = atob(input);
      
      try {
        const jsonObj = JSON.parse(decoded);
        base64Output.innerHTML = syntaxHighlightJSON(jsonObj);
      } catch {
        base64Output.textContent = decoded;
      }
      
      copyDecodedBtn.style.display = 'block';
    } catch (error) {
      base64Output.innerHTML = '<span style="color: #f44336;">Invalid Base64 input</span>';
      copyDecodedBtn.style.display = 'none';
    }
  });
  
  copyDecodedBtn.addEventListener('click', () => {
    const textToCopy = base64Output.textContent;
    navigator.clipboard.writeText(textToCopy).then(() => {
      const originalText = copyDecodedBtn.textContent;
      copyDecodedBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyDecodedBtn.textContent = originalText;
      }, 1500);
    });
  });
  
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.insiderGenerateTime) {
        updateGenerateTime();
      }
      if (changes.insiderErrorCount) {
        updateErrorCount();
      }
    }
  });
});

const updateGenerateTime = () => {
  chrome.storage.local.get(['insiderGenerateTime'], (result) => {
    const generateTime = result.insiderGenerateTime;
    const gtElement = document.getElementById('generateTime');
    
    if (generateTime) {
      const date = new Date(generateTime * 1000);
      gtElement.textContent = `GT: ${date.toLocaleString('tr-TR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })}`;
      gtElement.style.color = '#667eea';
    } else {
      gtElement.textContent = 'GT: -';
      gtElement.style.color = '#999';
    }
  });
};

const updateErrorCount = () => {
  chrome.storage.local.get(['insiderErrorCount'], (result) => {
    const errorCount = result.insiderErrorCount || 0;
    const errorIndicator = document.getElementById('errorIndicator');
    
    if (errorIndicator) {
      if (errorCount > 0) {
        errorIndicator.textContent = `${errorCount} error${errorCount > 1 ? 's' : ''}`;
        errorIndicator.style.display = 'block';
      } else {
        errorIndicator.style.display = 'none';
      }
    }
  });
};

const expandedItems = new Set();
const expandedSections = new Map();
let lastRecommendationCount = 0;
let lastHitCount = 0;
let lastUcdCount = 0;
let lastAddToCartCount = 0;
let lastRequestsHash = '';
let isRendering = false;

const startPolling = () => {
  setInterval(() => {
    chrome.storage.local.get(['recommendationRequests', 'hitRequests', 'ucdRequests', 'addToCartRequests'], (result) => {
      const recommendationRequests = result.recommendationRequests || [];
      const hitRequests = result.hitRequests || [];
      const ucdRequests = result.ucdRequests || [];
      const addToCartRequests = result.addToCartRequests || [];
      
      if (addToCartRequests.length > 0) {
        console.log('Add to Cart Requests:', addToCartRequests);
      }
      
      if (recommendationRequests.length !== lastRecommendationCount || hitRequests.length !== lastHitCount || ucdRequests.length !== lastUcdCount || addToCartRequests.length !== lastAddToCartCount) {
        lastRecommendationCount = recommendationRequests.length;
        lastHitCount = hitRequests.length;
        lastUcdCount = ucdRequests.length;
        lastAddToCartCount = addToCartRequests.length;
        loadRequests();
      }
    });
  }, 500);
};

const loadRequests = () => {
  if (isRendering) return;
  
  chrome.storage.local.get(['recommendationRequests', 'hitRequests', 'ucdRequests', 'addToCartRequests'], (result) => {
    const recommendationRequests = result.recommendationRequests || [];
    const hitRequests = result.hitRequests || [];
    const ucdRequests = result.ucdRequests || [];
    const addToCartRequests = result.addToCartRequests || [];
    
    const currentHash = JSON.stringify({
      rec: recommendationRequests.map(r => r.url + r.timestamp),
      hit: hitRequests.map(r => r.url + r.timestamp),
      ucd: ucdRequests.map(r => r.url + r.timestamp),
      cart: addToCartRequests.map(r => r.productId + r.timestamp),
      expanded: Array.from(expandedItems).sort(),
      sections: Array.from(expandedSections.entries()).sort()
    });
    
    document.getElementById('recommendationCount').textContent = recommendationRequests.length;
    document.getElementById('hitCount').textContent = hitRequests.length;
    document.getElementById('ucdCount').textContent = ucdRequests.length;
    document.getElementById('addToCartCount').textContent = addToCartRequests.length;
    
    if (currentHash !== lastRequestsHash) {
      isRendering = true;
      lastRequestsHash = currentHash;
      
      renderRequestList('recommendationList', recommendationRequests);
      renderRequestList('hitList', hitRequests);
      renderUcdList('ucdList', ucdRequests);
      renderAddToCartList('addToCartList', addToCartRequests);
      
      isRendering = false;
    }
  });
};

const renderRequestList = (containerId, requests) => {
  const requestList = document.getElementById(containerId);
  
  if (requests.length === 0) {
    requestList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">No requests detected yet.<br>Navigate to a page using the API.</div>
      </div>
    `;
    return;
  }
  
  requestList.innerHTML = [...requests].reverse().map((req, index) => {
      const parsedResponse = tryParseJSON(req.response);
      const products = extractProducts(req.response);
      const urlInfo = parseUrlInfo(req.url);
      const isExpanded = expandedItems.has(index);
      const urlExpanded = expandedSections.get(`${index}-url`) || false;
      const responseExpanded = expandedSections.get(`${index}-response`) || false;
      const attributesExpanded = expandedSections.get(`${index}-attributes`) || false;
      
      let displayTitle = urlInfo.algorithm;
      if (req.eventType) {
        displayTitle = req.eventType === 'pageView' && req.pageType ? req.pageType : req.eventType;
      }
      
      return `
        <div class="request-item" data-index="${index}">
          <div class="request-header">
            <div>
              <div class="request-algorithm">${displayTitle}</div>
              <div class="request-info">
                ${req.eventType ? '' : `<span class="request-param">Locale: ${urlInfo.locale || 'N/A'}</span>`}
                ${req.eventType ? '' : `<span class="request-param">Currency: ${urlInfo.currency || 'N/A'}</span>`}
                <span class="request-time">${req.timeString}</span>
              </div>
            </div>
            <span class="expand-icon">${isExpanded ? '▲' : '▼'}</span>
          </div>
          <div class="request-details ${isExpanded ? 'expanded' : ''}" id="details-${index}">
            <div class="detail-section">
              <div class="detail-label collapsible" data-index="${index}" data-section="url">
                Full URL <span class="collapse-icon">${urlExpanded ? '▲' : '▼'}</span>
              </div>
              <div class="detail-content ${urlExpanded ? 'expanded' : ''}" id="url-${index}">${req.url}</div>
            </div>
            ${req.body ? `
              <div class="detail-section">
                <div class="detail-label">Request Body</div>
                <div class="detail-content expanded">${formatRequestBody(req.body)}</div>
              </div>
            ` : ''}
            <div class="detail-section">
              <div class="detail-label collapsible" data-index="${index}" data-section="response">
                Response <span class="collapse-icon">${responseExpanded ? '▲' : '▼'}</span>
              </div>
              <div class="detail-content ${responseExpanded ? 'expanded' : ''}" id="response-${index}">${parsedResponse}</div>
            </div>
            ${products.length > 0 ? `
              <div class="detail-section">
                <div class="detail-label collapsible" data-index="${index}" data-section="attributes">
                  Product Attrıbutes (${products.length} products) <span class="collapse-icon">${attributesExpanded ? '▲' : '▼'}</span>
                </div>
                <div class="attributes-container ${attributesExpanded ? 'expanded' : ''}" id="attributes-${index}">
                  ${products.map((product, pIndex) => {
                    const productExpanded = expandedSections.get(`${index}-product-${pIndex}`) || false;
                    return `
                      <div class="product-item">
                        <div class="product-header collapsible" data-index="${index}" data-section="product-${pIndex}">
                          <div class="product-header-left">
                            ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.id}" class="product-image" />` : ''}
                            <span class="product-id">${product.id}</span>
                          </div>
                          <span class="collapse-icon">${productExpanded ? '▲' : '▼'}</span>
                        </div>
                        <div class="product-attributes ${productExpanded ? 'expanded' : ''}" id="product-${index}-${pIndex}">
                          ${formatAttributes(product.attributes)}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
    
  requestList.querySelectorAll('.request-item').forEach(item => {
      const header = item.querySelector('.request-header');
      header.addEventListener('click', (e) => {
        const index = parseInt(item.dataset.index);
        
        if (expandedItems.has(index)) {
          expandedItems.delete(index);
        } else {
          expandedItems.add(index);
        }
        
        loadRequests();
      });
    });
    
  requestList.querySelectorAll('.detail-label.collapsible').forEach(label => {
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = label.dataset.index;
        const section = label.dataset.section;
        const key = `${index}-${section}`;
        
        expandedSections.set(key, !expandedSections.get(key));
        loadRequests();
      });
    });
    
  requestList.querySelectorAll('.product-header.collapsible').forEach(header => {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = header.dataset.index;
        const section = header.dataset.section;
        const key = `${index}-${section}`;
        
        expandedSections.set(key, !expandedSections.get(key));
        loadRequests();
      });
    });
};

const tryParseJSON = (str) => {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch (e) {
    return str;
  }
};

const parseUrlInfo = (url) => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const searchParams = urlObj.searchParams;
    
    const algorithmMatch = pathname.match(/\/v2\/([^?]+)/);
    const algorithm = algorithmMatch ? algorithmMatch[1] : 'unknown';
    
    return {
      algorithm: algorithm,
      locale: searchParams.get('locale'),
      currency: searchParams.get('currency')
    };
  } catch (e) {
    return {
      algorithm: 'unknown',
      locale: null,
      currency: null
    };
  }
};

const extractProducts = (responseStr) => {
  try {
    const response = JSON.parse(responseStr);
    const data = response.data || [];
    
    return data.map(product => ({
      id: product.item_id || product.id || 'unknown',
      imageUrl: product.image_url || '',
      attributes: product.product_attributes || {}
    }));
  } catch (e) {
    return [];
  }
};

const formatAttributes = (attributes) => {
  if (!attributes || Object.keys(attributes).length === 0) {
    return '<div class="no-attributes">No attributes</div>';
  }
  
  return Object.entries(attributes).map(([key, value]) => {
    let displayValue = JSON.stringify(value);
    try {
      displayValue = decodeURIComponent(escape(displayValue));
    } catch (e) {
    }
    return `
      <div class="attribute-row">
        <span class="attribute-key">${key}:</span>
        <span class="attribute-value">${displayValue}</span>
      </div>
    `;
  }).join('');
};

const formatRequestBody = (bodyStr) => {
  try {
    const bodyObj = JSON.parse(bodyStr);
    return Object.entries(bodyObj).map(([key, value]) => {
      let displayValue = JSON.stringify(value);
      try {
        displayValue = decodeURIComponent(escape(displayValue));
      } catch (e) {
      }
      return `
        <div class="attribute-row">
          <span class="attribute-key">${key}:</span>
          <span class="attribute-value">${displayValue}</span>
        </div>
      `;
    }).join('');
  } catch (e) {
    return bodyStr;
  }
};

const renderUcdList = (containerId, requests) => {
  const requestList = document.getElementById(containerId);
  
  if (requests.length === 0) {
    requestList.innerHTML = `
      <button id="resetUcdSegmentsBtn" class="reset-ucd-btn">Reset UCD Segments</button>
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">No UCD segment requests detected yet.</div>
      </div>
    `;
    attachResetButtonListener();
    return;
  }
  
  requestList.innerHTML = `
    <button id="resetUcdSegmentsBtn" class="reset-ucd-btn">Reset UCD Segments</button>
  ` + [...requests].reverse().map((req, index) => {
    const isExpanded = expandedItems.has(`ucd-${index}`);
    
    let builders = [];
    let expireDate = '';
    
    try {
      const response = JSON.parse(req.response);
      if (response.results) {
        builders = Object.entries(response.results).map(([id, value]) => ({
          id,
          value
        }));
      }
    } catch (e) {
      console.log('Failed to parse UCD response:', e);
    }

    if (req.sessionExpire) {
      console.log('Session Expire Raw:', req.sessionExpire);
      const timestamp = parseInt(req.sessionExpire);
      if (!isNaN(timestamp)) {
        const expireTimestamp = (timestamp + 1800) * 1000;
        expireDate = new Date(expireTimestamp).toLocaleString('tr-TR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        console.log('Session Expire Formatted (+ 30 min):', expireDate);
      }
    } else {
      console.log('No sessionExpire found in request:', req);
    }
    
    return `
      <div class="request-item" data-index="ucd-${index}">
        <div class="request-header">
          <div>
            <div class="request-algorithm">UCD Segment Requests</div>
            <div class="request-info">
              <span class="request-param">Builders: ${builders.length}</span>
              ${expireDate ? `<span class="request-param">Expire: ${expireDate}</span>` : ''}
              <span class="request-time">${req.timeString}</span>
            </div>
          </div>
          <span class="expand-icon">${isExpanded ? '▲' : '▼'}</span>
        </div>
        <div class="request-details ${isExpanded ? 'expanded' : ''}" id="details-ucd-${index}">
          <div class="detail-section">
            <div class="detail-label">Full URL</div>
            <div class="detail-content expanded">${req.url}</div>
          </div>
          ${expireDate ? `
            <div class="detail-section">
              <div class="detail-label">Sessıon Expıre Date</div>
              <div class="detail-content expanded">
                <div class="attribute-row">
                  <span class="attribute-key">Expires At:</span>
                  <span class="attribute-value">${expireDate}</span>
                </div>
                <div class="attribute-row">
                  <span class="attribute-key">Raw Timestamp:</span>
                  <span class="attribute-value">${req.sessionExpire}</span>
                </div>
              </div>
            </div>
          ` : ''}
          ${builders.length > 0 ? `
            <div class="detail-section">
              <div class="detail-label">Buılder IDs</div>
              <div class="detail-content expanded">
                ${builders.map(builder => `
                  <div class="attribute-row">
                    <span class="attribute-key">${builder.id}:</span>
                    <span class="attribute-value">${builder.value}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
  
  requestList.querySelectorAll('.request-item').forEach(item => {
    const header = item.querySelector('.request-header');
    header.addEventListener('click', (e) => {
      const index = item.dataset.index;
      
      if (expandedItems.has(index)) {
        expandedItems.delete(index);
      } else {
        expandedItems.add(index);
      }
      
      loadRequests();
    });
  });
  
  attachResetButtonListener();
};

const attachResetButtonListener = () => {
  const resetBtn = document.getElementById('resetUcdSegmentsBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'RESET_UCD_SEGMENTS' }, (response) => {
          if (chrome.runtime.lastError) {
            // Extension context invalidated - ignore
            return;
          }
          
          if (response && response.success) {
            const originalText = resetBtn.textContent;
            const originalBg = resetBtn.style.background;
            
            resetBtn.textContent = 'Resetted!';
            resetBtn.style.background = 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)';
            resetBtn.style.boxShadow = '0 2px 4px rgba(76, 175, 80, 0.3)';
            
            setTimeout(() => {
              resetBtn.textContent = originalText;
              resetBtn.style.background = originalBg;
              resetBtn.style.boxShadow = '0 2px 4px rgba(244, 67, 54, 0.3)';
            }, 2000);
          }
        });
      });
    });
  }
};

const renderAddToCartList = (containerId, requests) => {
  const requestList = document.getElementById(containerId);
  
  if (requests.length === 0) {
    requestList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🛒</div>
        <div class="empty-state-text">No add to cart events detected yet.<br>Enable tracking with the toggle above.</div>
      </div>
    `;
    return;
  }
  
  requestList.innerHTML = [...requests].reverse().map((req, index) => {
    const isExpanded = expandedItems.has(`cart-${index}`);
    const product = req.product || {};
    
    return `
      <div class="request-item" data-index="cart-${index}">
        <div class="request-header">
          <div>
            <div class="request-algorithm">Product ID: ${req.productId}</div>
            <div class="request-info">
              <span class="request-param">Name: ${product.name || 'N/A'}</span>
              <span class="request-time">${req.timeString}</span>
            </div>
          </div>
          <span class="expand-icon">${isExpanded ? '▲' : '▼'}</span>
        </div>
        <div class="request-details ${isExpanded ? 'expanded' : ''}" id="details-cart-${index}">
          <div class="detail-section">
            <div class="detail-label">Product Details</div>
            <div class="detail-content expanded">
              ${Object.entries(product).map(([key, value]) => {
                let displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
                try {
                  displayValue = decodeURIComponent(escape(String(displayValue)));
                } catch (e) {}
                return `
                  <div class="attribute-row">
                    <span class="attribute-key">${key}:</span>
                    <span class="attribute-value">${displayValue}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  requestList.querySelectorAll('.request-item').forEach(item => {
    const header = item.querySelector('.request-header');
    header.addEventListener('click', (e) => {
      const index = item.dataset.index;
      
      if (expandedItems.has(index)) {
        expandedItems.delete(index);
      } else {
        expandedItems.add(index);
      }
      
      loadRequests();
    });
  });
};

const syntaxHighlightJSON = (json) => {
  if (typeof json !== 'string') {
    json = JSON.stringify(json, null, 2);
  }
  
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'json-key';
      } else {
        cls = 'json-string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    return '<span class="' + cls + '">' + match + '</span>';
  });
};
