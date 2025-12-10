document.addEventListener('DOMContentLoaded', () => {
  loadRequests();
  setInterval(loadRequests, 2000);
});

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
    
    requestList.innerHTML = [...requests].reverse().map(req => `
      <div class="request-item">
        <div class="request-url">${req.url}</div>
        <div class="request-info">
          <span class="request-method">${req.method}</span>
          <span class="request-status">Status: ${req.status}</span>
          <span class="request-time">${req.timeString}</span>
        </div>
      </div>
    `).join('');
    
    console.log(`Loaded ${requests.length} API requests`);
  });
};
