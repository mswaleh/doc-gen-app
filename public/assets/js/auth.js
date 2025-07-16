// Cloud File Manager - Authentication JavaScript

/**
 * Handle login form submission
 */
async function handleLogin(event) {
    event.preventDefault();
    
    const platform = document.getElementById('platform-select').value;
    const username = document.getElementById('username-input').value.trim();
    
    if (!platform || !username) {
        showToast('Please select a platform and enter username', 'error');
        return;
    }
    
    try {
        showLoginLoading(true);
        
        const response = await window.apiClient.login(platform, username);
        
        if (response.success) {
            CloudFileManager.auth.token = response.token;
            CloudFileManager.auth.user = response.user;
            CloudFileManager.auth.platform = response.user.platform;
            
            showToast(`Welcome, ${response.user.username}!`, 'success');
            showFileManagerSection();
            await loadPlatforms();
        } else {
            throw new Error(response.error || 'Login failed');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        showToast(error.message || 'Login failed', 'error');
    } finally {
        showLoginLoading(false);
    }
}

/**
 * Show/hide login loading state
 */
function showLoginLoading(loading) {
    const button = document.querySelector('#loginForm button[type="submit"]');
    const buttonText = document.getElementById('loginButtonText');
    const spinner = document.getElementById('loginSpinner');
    const form = document.getElementById('loginForm');
    
    if (loading) {
        button.disabled = true;
        buttonText.classList.add('slds-hide');
        spinner.classList.remove('slds-hide');
        form.style.pointerEvents = 'none';
    } else {
        button.disabled = false;
        buttonText.classList.remove('slds-hide');
        spinner.classList.add('slds-hide');
        form.style.pointerEvents = 'auto';
    }
}

/**
 * Handle embedded authentication
 */
async function handleEmbeddedAuth(params) {
    try {
        const response = await fetch('/api/auth/embed', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        });
        
        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('cfm_token', data.token);
            CloudFileManager.auth.token = data.token;
            CloudFileManager.auth.user = data.user;
            CloudFileManager.auth.platform = data.user.platform;
            
            // Set context for embedded mode
            if (data.context) {
                CloudFileManager.state.recordId = data.context.recordId || '';
                CloudFileManager.embed = {
                    parentUrl: data.context.parentUrl,
                    recordId: data.context.recordId
                };
            }
            
            return true;
        } else {
            throw new Error(data.error || 'Embedded authentication failed');
        }
        
    } catch (error) {
        console.error('Embedded auth error:', error);
        return false;
    }
}

/**
 * Verify token and refresh if needed
 */
async function verifyAndRefreshToken() {
    const token = CloudFileManager.auth.token || localStorage.getItem('cfm_token');
    
    if (!token) {
        return false;
    }
    
    try {
        const response = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token: token })
        });
        
        const data = await response.json();
        
        if (data.valid) {
            if (data.refreshed && data.token) {
                // Token was refreshed
                localStorage.setItem('cfm_token', data.token);
                CloudFileManager.auth.token = data.token;
            }
            return true;
        } else {
            // Token is invalid
            localStorage.removeItem('cfm_token');
            CloudFileManager.auth.token = null;
            CloudFileManager.auth.user = null;
            return false;
        }
        
    } catch (error) {
        console.error('Token verification error:', error);
        return false;
    }
}

/**
 * Auto-refresh token before expiration
 */
function startTokenRefreshTimer() {
    // Check token every 30 minutes
    setInterval(async () => {
        if (CloudFileManager.auth.token) {
            await verifyAndRefreshToken();
        }
    }, 30 * 60 * 1000);
}

/**
 * Parse JWT payload (client-side only for display purposes)
 */
function parseJWTPayload(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        
        return JSON.parse(jsonPayload);
    } catch (error) {
        console.error('Error parsing JWT:', error);
        return null;
    }
}

/**
 * Check if token is close to expiration
 */
function isTokenExpiringSoon(token, thresholdMinutes = 15) {
    const payload = parseJWTPayload(token);
    if (!payload || !payload.exp) {
        return true; // Assume expiring if we can't parse
    }
    
    const expirationTime = payload.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const timeUntilExpiration = expirationTime - currentTime;
    const thresholdTime = thresholdMinutes * 60 * 1000;
    
    return timeUntilExpiration < thresholdTime;
}

/**
 * Get user info from token
 */
function getUserInfoFromToken(token) {
    const payload = parseJWTPayload(token);
    if (!payload) {
        return null;
    }
    
    return {
        username: payload.username,
        platform: payload.platform,
        userId: payload.userId,
        embed: payload.embed || false,
        parentUrl: payload.parentUrl,
        recordId: payload.recordId
    };
}

/**
 * Handle logout
 */
async function performLogout() {
    try {
        // Call logout endpoint
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CloudFileManager.auth.token}`
            }
        });
    } catch (error) {
        console.error('Logout API error:', error);
        // Continue with client-side logout even if API fails
    }
    
    // Clear local storage and state
    localStorage.removeItem('cfm_token');
    CloudFileManager.auth.token = null;
    CloudFileManager.auth.user = null;
    CloudFileManager.auth.platform = null;
    
    // Reset application state
    CloudFileManager.state = {
        selectedPlatform: '',
        selectedBucket: '',
        recordId: '',
        files: [],
        loading: false
    };
    
    // Show login section
    showLoginSection();
}

/**
 * Platform-specific authentication helpers
 */
const PlatformAuth = {
    /**
     * Salesforce authentication integration
     */
    salesforce: {
        /**
         * Extract session ID from Salesforce context
         */
        getSessionId() {
            // In a real Salesforce integration, you would access the session ID
            // This is a placeholder implementation
            if (window.sforce && window.sforce.connection) {
                return window.sforce.connection.getSessionId();
            }
            return null;
        },
        
        /**
         * Get current user info from Salesforce
         */
        getCurrentUser() {
            // In a real implementation, you would call Salesforce APIs
            if (window.$A) { // Lightning Platform
                const user = window.$A.get("$SObjectType.CurrentUser");
                return {
                    username: user.Username,
                    userId: user.Id
                };
            }
            return null;
        }
    },
    
    /**
     * ServiceNow authentication integration
     */
    servicenow: {
        /**
         * Get session token from ServiceNow
         */
        getSessionToken() {
            // In a real ServiceNow integration, you would access the session token
            // This is a placeholder implementation
            if (window.g_ck && window.g_ck.length > 0) {
                return window.g_ck;
            }
            return null;
        },
        
        /**
         * Get current user info from ServiceNow
         */
        getCurrentUser() {
            // In a real implementation, you would call ServiceNow APIs
            if (window.g_user) {
                return {
                    username: window.g_user.userName,
                    userId: window.g_user.userID
                };
            }
            return null;
        }
    }
};

/**
 * Initialize authentication system
 */
function initializeAuthentication() {
    // Start token refresh timer
    startTokenRefreshTimer();
    
    // Check for embedded context
    const urlParams = new URLSearchParams(window.location.search);
    const isEmbedded = urlParams.get('embedded') === 'true';
    
    if (isEmbedded) {
        handleEmbeddedMode();
    }
}

/**
 * Handle embedded mode initialization
 */
async function handleEmbeddedMode() {
    try {
        // Try to get authentication info from parent context
        const parentUrl = document.referrer || window.location.ancestorOrigins?.[0];
        
        if (!parentUrl) {
            console.warn('No parent URL detected for embedded mode');
            return;
        }
        
        // Detect platform based on parent URL
        let platform = 'standalone';
        if (parentUrl.includes('salesforce.com') || parentUrl.includes('force.com')) {
            platform = 'salesforce';
        } else if (parentUrl.includes('servicenow.com') || parentUrl.includes('service-now.com')) {
            platform = 'servicenow';
        }
        
        // Try to get username from URL parameters or platform context
        const urlParams = new URLSearchParams(window.location.search);
        const username = urlParams.get('username') || 
                        PlatformAuth[platform]?.getCurrentUser()?.username ||
                        'embedded-user';
        
        const recordId = urlParams.get('recordId') || '';
        
        // Attempt embedded authentication
        const authParams = {
            parentUrl: parentUrl,
            platform: platform,
            username: username,
            recordId: recordId
        };
        
        const success = await handleEmbeddedAuth(authParams);
        
        if (success) {
            showFileManagerSection();
        } else {
            showLoginSection();
        }
        
    } catch (error) {
        console.error('Embedded mode initialization failed:', error);
        showLoginSection();
    }
}

// Initialize authentication when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeAuthentication();
});

// Export functions for global access
window.handleLogin = handleLogin;
window.performLogout = performLogout;
window.verifyAndRefreshToken = verifyAndRefreshToken;
window.PlatformAuth = PlatformAuth;