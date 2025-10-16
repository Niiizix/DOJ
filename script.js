// Gestion de l'authentification
const AUTH = {
  WORKER_URL: 'https://discord-auth.charliemoimeme.workers.dev', // L'URL de votre Worker
  
  // Fonction utilitaire Base64URL Decode
  b64urlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) { str += '='; }
    return JSON.parse(atob(str));
  },

  init() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
      // Stocker le token et nettoyer l'URL pour ne pas laisser le token dans l'historique
      sessionStorage.setItem('doj_token', token);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // Vérifier si on est sur une page intranet
    if (window.location.pathname.includes('/intranet/')) {
      // Démarrer la vérification asynchrone pour la protection des pages
      this.checkAuth().then(isAuthenticated => {
          if (isAuthenticated) {
            this.handlePermissionCheck();
          }
      });
    }
  },
  
  getToken() {
    return sessionStorage.getItem('doj_token');
  },
  
  // Fonction de décodage JWT côté client (pour lecture rapide)
  decodeJWT(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const payload = this.b64urlDecode(parts[1]);
      
      // La vérification d'expiration est faite ici, mais sera confirmée par le Worker
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        console.warn('Token expiré côté client.');
        this.logout();
        return null;
      }
      
      return payload;
    } catch (e) {
      console.error('ERROR décodage JWT:', e);
      return null;
    }
  },
  
  // Vérification principale et sécurisée
  async checkAuth() {
    const token = this.getToken();
    
    if (!token) {
      console.log('REDIRECT: pas de token');
      window.location.href = '../?error=not_authenticated';
      return false;
    }
    
    // 1. Vérification rapide locale (pour éviter des appels Worker inutiles si expiré)
    if (!this.decodeJWT(token)) {
        // La fonction decodeJWT appelle déjà logout() si expiré
        return false;
    }

    // 2. Vérification sécurisée côté Worker (signature + expiration confirmées)
    try {
        const response = await fetch(`${this.WORKER_URL}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token })
        });

        const data = await response.json();

        if (data.valid) {
            // Le token est valide, mettre à jour l'UI avec les données fraîches du payload
            this.updateUserInfo(data.payload);
            return true;
        } else {
            // Le Worker a déterminé que le token est invalide ou expiré
            console.log('REDIRECT: token invalide/expiré par Worker');
            this.logout();
            return false;
        }

    } catch (error) {
        console.error('Erreur Worker Auth:', error);
        window.location.href = '../?error=network_error';
        return false;
    }
  },
  
  // Vérifie si l'utilisateur a la permission d'accéder à la page Admin
  handlePermissionCheck() {
    const pathname = window.location.pathname;
    
    if (pathname.includes('/intra-admin.html')) {
        // La permission requise pour Admin est 'admin-view' ou '*'
        if (!this.hasPermission('admin-view')) {
            console.log('REDIRECT: Permission refusée pour Admin');
            // Redirection vers le dashboard si l'utilisateur n'a pas la permission
            window.location.href = 'intra-dashboard.html?error=unauthorized_access';
        }
    }
    // Ajoutez d'autres vérifications de page ici si nécessaire
  },
  
  updateUserInfo(payload) {
    const userNameEl = document.querySelector('.user-name');
    const userBadgeEl = document.querySelector('.user-badge');
    
    if (userNameEl) userNameEl.textContent = payload.username;
    if (userBadgeEl) userBadgeEl.textContent = payload.role;
    
    console.log(`Authentification OK: ${payload.username} (${payload.role})`);
  },
  
  logout() {
    sessionStorage.removeItem('doj_token');
    // Redirection vers la page publique index.html
    window.location.href = '../';
  },
  
  hasPermission(permission) {
    const token = this.getToken();
    if (!token) return false;
    
    const payload = this.decodeJWT(token);
    if (!payload || !payload.permissions) return false;
    
    // Si l'utilisateur a la permission '*' (Admin), il a toutes les permissions
    if (payload.permissions.includes('*')) return true;
    
    // Vérifie la permission spécifique ou la permission de plus haut niveau (admin-full > admin-view)
    if (permission === 'admin-view' && payload.permissions.includes('admin-full')) return true;
    
    return payload.permissions.includes(permission);
  }
};

// Gestion du timeout de session (page admin)
const ADMIN = {
  // Met à jour l'URL du Worker pour une meilleure cohérence
  WORKER_URL: AUTH.WORKER_URL, 

  async loadSessionTimeout() {
    // Vérification de permission avant de charger/tenter de modifier
    if (!AUTH.hasPermission('admin-view')) {
        console.error("Permission denied to load ADMIN settings.");
        return;
    }

    try {
      const token = AUTH.getToken();
      
      const response = await fetch(`${this.WORKER_URL}/api/settings/session-timeout`, {
          // Si d'autres APIs sont protégées, il faudrait inclure le token
          // headers: { 'Authorization': `Bearer ${token}` } 
      });
      
      const data = await response.json();
      
      if (response.ok) {
          const minutes = Math.floor(data.timeout / 60);
          const select = document.querySelector('#session-timeout-select');
          if (select) {
            select.value = minutes;
          }
      } else {
          console.error('Failed to load session timeout:', data.error);
      }
      
    } catch (error) {
      console.error('Failed to load session timeout:', error);
    }
  },
  
  async updateSessionTimeout(minutes) {
    // Vérification de permission avant de mettre à jour
    if (!AUTH.hasPermission('admin-full')) {
        // Utilise admin-full pour la modification (selon votre structure ROLE_PERMISSIONS)
        console.error("Permission denied to update ADMIN settings.");
        return false;
    }

    try {
      const response = await fetch(`${this.WORKER_URL}/api/settings/session-timeout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: minutes * 60 })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        console.log('Session timeout updated:', minutes, 'minutes');
        return true;
      } else {
        console.error('Failed to update session timeout:', data.error || 'Unknown error');
        return false;
      }
    } catch (error) {
      console.error('Failed to update session timeout:', error);
      return false;
    }
  }
};

// ========== GESTION DES WEBHOOKS (Fonctions inchangées) ==========

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
        <button class="btn-submit" onclick="closeRecruitmentModal(); document.getElementById('recruitment-form').style.display = 'block';">Close and Retry</button>
      `;
    }
  } catch (error) {
    console.error('Error:', error);
    resultDiv.style.display = 'block';
    resultDiv.className = 'form-result error';
    resultDiv.innerHTML = `
      <h3>✗ Network Error</h3>
      <p>Unable to submit your application. Please check your connection and try again.</p>
      <button class="btn-submit" onclick="closeRecruitmentModal(); document.getElementById('recruitment-form').style.display = 'block';">Close and Retry</button>
    `;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Envoyer la fiche';
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
        <button class="btn-submit" onclick="closeAttorneyModal(); document.getElementById('attorney-form').style.display = 'block';">Close and Retry</button>
      `;
    }
  } catch (error) {
    console.error('Error:', error);
    resultDiv.style.display = 'block';
    resultDiv.className = 'form-result error';
    resultDiv.innerHTML = `
      <h3>✗ Network Error</h3>
      <p>Unable to submit your request. Please check your connection and try again.</p>
      <button class="btn-submit" onclick="closeAttorneyModal(); document.getElementById('attorney-form').style.display = 'block';">Close and Retry</button>
    `;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Prendre contact';
  }
}

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
        <button class="btn-submit" onclick="closeDirectionModal(); document.getElementById('direction-form').style.display = 'block';">Close and Retry</button>
      `;
    }
  } catch (error) {
    console.error('Error:', error);
    resultDiv.style.display = 'block';
    resultDiv.className = 'form-result error';
    resultDiv.innerHTML = `
      <h3>✗ Network Error</h3>
      <p>Unable to submit your request. Please check your connection and try again.</p>
      <button class="btn-submit" onclick="closeDirectionModal(); document.getElementById('direction-form').style.display = 'block';">Close and Retry</button>
    `;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Prendre Contact';
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
  if (window.location.pathname.includes('intra-admin.html')) {
    console.log('On admin page');
    
    // Seul le chargement se fait ici. La vérification de permission
    // est gérée par AUTH.handlePermissionCheck() dans AUTH.init().
    ADMIN.loadSessionTimeout(); 
    
    const timeoutSelect = document.querySelector('#session-timeout-select');
    
    if (timeoutSelect) {
      console.log('Adding event listener to Admin select');
      timeoutSelect.addEventListener('change', async (e) => {
        const minutes = parseInt(e.target.value);
        console.log('Trying to save timeout:', minutes, 'minutes');
        
        const success = await ADMIN.updateSessionTimeout(minutes);
        
        // IMPORTANT: Remplacer alert() par une notification visuelle ou un console.log
        if (success) {
          console.log(`Timeout saved: ${minutes} minutes`);
        } else {
          console.error('Failed to save timeout.');
          // Recharger le bon timeout en cas d'échec ou d'erreur de permission
          ADMIN.loadSessionTimeout(); 
        }
      });
    } else {
      console.log('Select NOT found - check the ID in HTML');
    }
  }
});
