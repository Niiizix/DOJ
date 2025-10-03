// Gestion de l'authentification
const AUTH = {
  WORKER_URL: 'https://discord-auth.charliemoimeme.workers.dev', // Remplace par ton URL de Worker
  
  init() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
      sessionStorage.setItem('doj_token', token);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // Vérifier si on est sur une page intranet
    if (window.location.pathname.includes('/intranet/')) {
      this.checkAuth();
    }
  },
  
  getToken() {
    return sessionStorage.getItem('doj_token');
  },
  
  decodeJWT(token) {
    try {
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1]));
      
      console.log('=== JWT DEBUG ===');
      console.log('Token exp:', payload.exp);
      console.log('Now:', Math.floor(Date.now() / 1000));
      console.log('Expired?', payload.exp < Date.now() / 1000);
      
      if (payload.exp && payload.exp < Date.now() / 1000) {
        console.log('REDIRECT: token expiré');
        this.logout();
        return null;
      }
      
      return payload;
    } catch (e) {
      console.log('ERROR décodage:', e);
      return null;
    }
  },
  
  checkAuth() {
    const token = this.getToken();
    console.log('=== AUTH CHECK ===');
    console.log('Token présent:', !!token);
    
    if (!token) {
      console.log('REDIRECT: pas de token');
      window.location.href = '/?error=not_authenticated';
      return false;
    }
    
    const payload = this.decodeJWT(token);
    console.log('Payload décodé:', payload);
    
    if (!payload) {
      console.log('REDIRECT: payload null');
      window.location.href = '/?error=session_expired';
      return false;
    }
    
    this.updateUserInfo(payload);
    return true;
  },
  
  updateUserInfo(payload) {
    const userNameEl = document.querySelector('.user-name');
    const userBadgeEl = document.querySelector('.user-badge');
    
    if (userNameEl) userNameEl.textContent = payload.username;
    if (userBadgeEl) userBadgeEl.textContent = payload.role;
  },
  
  logout() {
    sessionStorage.removeItem('doj_token');
    window.location.href = '/';
  },
  
  hasPermission(permission) {
    const token = this.getToken();
    if (!token) return false;
    
    const payload = this.decodeJWT(token);
    if (!payload) return false;
    
    if (payload.permissions.includes('*')) return true;
    return payload.permissions.includes(permission);
  }
};

// Gestion du timeout de session (page admin)
const ADMIN = {
  async loadSessionTimeout() {
    try {
      const response = await fetch(`${AUTH.WORKER_URL}/api/settings/session-timeout`);
      const data = await response.json();
      
      const minutes = Math.floor(data.timeout / 60);
      const select = document.querySelector('#session-timeout-select');
      if (select) {
        select.value = minutes;
      }
    } catch (error) {
      console.error('Failed to load session timeout:', error);
    }
  },
  
  async updateSessionTimeout(minutes) {
    try {
      const response = await fetch(`${AUTH.WORKER_URL}/api/settings/session-timeout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: minutes * 60 })
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log('Session timeout updated:', minutes, 'minutes');
        return true;
      } else {
        console.error('Failed to update session timeout');
        return false;
      }
    } catch (error) {
      console.error('Failed to update session timeout:', error);
      return false;
    }
  }
};

// ========== GESTION DES WEBHOOKS ==========

// Fonctions pour les modals - Recrutement
function openRecruitmentModal() {
  document.getElementById('recruitment-modal').style.display = 'block';
  document.getElementById('recruitment-result').style.display = 'none';
  document.getElementById('recruitment-form').reset();
}

function closeRecruitmentModal() {
  document.getElementById('recruitment-modal').style.display = 'none';
}

// Fonctions pour les modals - Procureur
function openAttorneyModal() {
  document.getElementById('attorney-modal').style.display = 'block';
  document.getElementById('attorney-result').style.display = 'none';
  document.getElementById('attorney-form').reset();
}

function closeAttorneyModal() {
  document.getElementById('attorney-modal').style.display = 'none';
}

// Fonctions pour les modals - Direction
function openDirectionModal() {
  document.getElementById('direction-modal').style.display = 'block';
  document.getElementById('direction-result').style.display = 'none';
  document.getElementById('direction-form').reset();
}

function closeDirectionModal() {
  document.getElementById('direction-modal').style.display = 'none';
}

// Fermer les modals en cliquant en dehors
window.onclick = function(event) {
  if (event.target.classList.contains('modal')) {
    event.target.style.display = 'none';
  }
}

// Soumission du formulaire de recrutement
async function submitRecruitmentForm(event) {
  event.preventDefault();
  
  const submitBtn = event.target.querySelector('.btn-submit');
  const resultDiv = document.getElementById('recruitment-result');
  
  // Désactiver le bouton pendant l'envoi
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';
  
  const formData = {
    name: document.getElementById('recruitment-name').value,
    dob: document.getElementById('recruitment-dob').value,
    phone: document.getElementById('recruitment-phone').value,
    email: document.getElementById('recruitment-email').value
  };
  
  try {
    const response = await fetch(`${AUTH.WORKER_URL}/api/webhook/recruitment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    const data = await response.json();
    
    // Masquer le formulaire
    document.getElementById('recruitment-form').style.display = 'none';
    
    // Afficher le résultat
    resultDiv.style.display = 'block';
    
    if (data.success) {
      resultDiv.className = 'form-result success';
      resultDiv.innerHTML = `
        <h3>✓ Application Submitted Successfully</h3>
        <p>Your application has been received and is being reviewed by our recruitment team.</p>
        <div class="case-number">
          <strong>Application Number:</strong> ${data.caseNumber}
        </div>
        <p>Please save this number for future reference. You will be contacted within 3-5 business days.</p>
        <button class="btn-submit" onclick="closeRecruitmentModal()">Close</button>
      `;
    } else {
      resultDiv.className = 'form-result error';
      resultDiv.innerHTML = `
        <h3>✗ Submission Error</h3>
        <p>${data.error}</p>
        <button class="btn-submit" onclick="location.reload()">Try Again</button>
      `;
    }
  } catch (error) {
    console.error('Error:', error);
    resultDiv.style.display = 'block';
    resultDiv.className = 'form-result error';
    resultDiv.innerHTML = `
      <h3>✗ Network Error</h3>
      <p>Unable to submit your application. Please check your connection and try again.</p>
      <button class="btn-submit" onclick="location.reload()">Retry</button>
    `;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Application';
  }
}

// Soumission du formulaire contact procureur
async function submitAttorneyForm(event) {
  event.preventDefault();
  
  const submitBtn = event.target.querySelector('.btn-submit');
  const resultDiv = document.getElementById('attorney-result');
  
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';
  
  const formData = {
    name: document.getElementById('attorney-name').value,
    phone: document.getElementById('attorney-phone').value,
    email: document.getElementById('attorney-email').value,
    reason: document.getElementById('attorney-reason').value
  };
  
  try {
    const response = await fetch(`${AUTH.WORKER_URL}/api/webhook/attorney`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    const data = await response.json();
    
    document.getElementById('attorney-form').style.display = 'none';
    resultDiv.style.display = 'block';
    
    if (data.success) {
      resultDiv.className = 'form-result success';
      resultDiv.innerHTML = `
        <h3>✓ Request Submitted Successfully</h3>
        <p>Your contact request has been sent to our federal prosecutors.</p>
        <div class="case-number">
          <strong>Request Number:</strong> ${data.caseNumber}
        </div>
        <p>A prosecutor will review your request and contact you within 24-48 hours.</p>
        <button class="btn-submit" onclick="closeAttorneyModal()">Close</button>
      `;
    } else {
      resultDiv.className = 'form-result error';
      resultDiv.innerHTML = `
        <h3>✗ Submission Error</h3>
        <p>${data.error}</p>
        <button class="btn-submit" onclick="location.reload()">Try Again</button>
      `;
    }
  } catch (error) {
    console.error('Error:', error);
    resultDiv.style.display = 'block';
    resultDiv.className = 'form-result error';
    resultDiv.innerHTML = `
      <h3>✗ Network Error</h3>
      <p>Unable to submit your request. Please check your connection and try again.</p>
      <button class="btn-submit" onclick="location.reload()">Retry</button>
    `;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Request';
  }
}

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => {
  console.log('Script.js loaded');
  
  AUTH.init();
  
  // Bouton logout
  const logoutBtn = document.querySelector('.logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      AUTH.logout();
    });
  }
  
  // Si on est sur la page admin, charger le timeout
  if (window.location.pathname.includes('intra-admin')) {
    console.log('On admin page');
    ADMIN.loadSessionTimeout();
    
    const timeoutSelect = document.querySelector('#session-timeout-select');
    console.log('Select found:', timeoutSelect);
    
    if (timeoutSelect) {
      console.log('Adding event listener');
      timeoutSelect.addEventListener('change', async (e) => {
        console.log('Change event fired!');
        const minutes = parseInt(e.target.value);
        console.log('Trying to save timeout:', minutes, 'minutes');
        
        const success = await ADMIN.updateSessionTimeout(minutes);
        console.log('Save result:', success);
        
        if (success) {
          alert('Timeout saved: ' + minutes + ' minutes');
        }
      });
    } else {
      console.log('Select NOT found - check the ID in HTML');
    }
  }
});

// Soumission du formulaire contact direction
async function submitDirectionForm(event) {
  event.preventDefault();
  
  const submitBtn = event.target.querySelector('.btn-submit');
  const resultDiv = document.getElementById('direction-result');
  
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';
  
  const formData = {
    name: document.getElementById('direction-name').value,
    phone: document.getElementById('direction-phone').value,
    email: document.getElementById('direction-email').value,
    reason: document.getElementById('direction-reason').value
  };
  
  try {
    const response = await fetch(`${AUTH.WORKER_URL}/api/webhook/direction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    const data = await response.json();
    
    document.getElementById('direction-form').style.display = 'none';
    resultDiv.style.display = 'block';
    
    if (data.success) {
      resultDiv.className = 'form-result success';
      resultDiv.innerHTML = `
        <h3>✓ Request Submitted Successfully</h3>
        <p>Your meeting request has been sent to DOJ leadership.</p>
        <div class="case-number">
          <strong>Request Number:</strong> ${data.caseNumber}
        </div>
        <p>Our executive office will review your request and contact you within 3-5 business days to schedule a meeting.</p>
        <button class="btn-submit" onclick="closeDirectionModal()">Close</button>
      `;
    } else {
      resultDiv.className = 'form-result error';
      resultDiv.innerHTML = `
        <h3>✗ Submission Error</h3>
        <p>${data.error}</p>
        <button class="btn-submit" onclick="location.reload()">Try Again</button>
      `;
    }
  } catch (error) {
    console.error('Error:', error);
    resultDiv.style.display = 'block';
    resultDiv.className = 'form-result error';
    resultDiv.innerHTML = `
      <h3>✗ Network Error</h3>
      <p>Unable to submit your request. Please check your connection and try again.</p>
      <button class="btn-submit" onclick="location.reload()">Retry</button>
    `;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Request';
  }
}
