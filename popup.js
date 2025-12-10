document.addEventListener('DOMContentLoaded', () => {
  loadRequests();
  startPolling();
  
  document.getElementById('clearBtn').addEventListener('click', () => {
    chrome.storage.local.set({ apiRequests: [] }, () => {
      expandedItems.clear();
      expandedSections.clear();
      lastRequestCount = 0;
      loadRequests();
    });
  });
});

const expandedItems = new Set();
const expandedSections = new Map();
let lastRequestCount = 0;

const startPolling = () => {
  setInterval(() => {
    chrome.storage.local.get(['apiRequests'], (result) => {
      const requests = result.apiRequests || [];
      if (requests.length !== lastRequestCount) {
        lastRequestCount = requests.length;
        loadRequests();
      }
    });
  }, 500);
};

const loadRequests = () => {
  chrome.storage.local.get(['apiRequests'], (result) => {
    const requests = result.apiRequests || [];
    
    document.getElementById('totalRequests').textContent = requests.length;
    
    const requestList = document.getElementById('requestList');
    
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
      
      return `
        <div class="request-item" data-index="${index}">
          <div class="request-header">
            <div>
              <div class="request-algorithm">${urlInfo.algorithm}</div>
              <div class="request-info">
                <span class="request-param">Locale: ${urlInfo.locale || 'N/A'}</span>
                <span class="request-param">Currency: ${urlInfo.currency || 'N/A'}</span>
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
                <div class="detail-content expanded">${req.body}</div>
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
    
    document.querySelectorAll('.request-item').forEach(item => {
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
    
    document.querySelectorAll('.detail-label.collapsible').forEach(label => {
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = label.dataset.index;
        const section = label.dataset.section;
        const key = `${index}-${section}`;
        
        expandedSections.set(key, !expandedSections.get(key));
        loadRequests();
      });
    });
    
    document.querySelectorAll('.product-header.collapsible').forEach(header => {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = header.dataset.index;
        const section = header.dataset.section;
        const key = `${index}-${section}`;
        
        expandedSections.set(key, !expandedSections.get(key));
        loadRequests();
      });
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
  
  return Object.entries(attributes).map(([key, value]) => `
    <div class="attribute-row">
      <span class="attribute-key">${key}:</span>
      <span class="attribute-value">${JSON.stringify(value)}</span>
    </div>
  `).join('');
};
