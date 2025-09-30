// Gestion de l'authentification
const AUTH = {
  WORKER_URL: 'https://ton-worker.workers.dev', // Remplace par ton URL Worker
  
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
      
      if (payload.exp && payload.exp < Date.now() / 1000) {
        this.logout();
        return null;
      }
      
      return payload;
    } catch (e) {
      return null;
    }
  },
  
  checkAuth() {
    const token = this.getToken();
    if (!token) {
      window.location.href = '/?error=not_authenticated';
      return false;
    }
    
    const payload = this.decodeJWT(token);
    if (!payload) {
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
