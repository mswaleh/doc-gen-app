// Cloud File Manager - Core API Client
// Save this as public/assets/js/apiClient.js

class APIClient {
    constructor() {
        this.baseURL = '/api';
        this.token = localStorage.getItem('cfm_token');
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('cfm_token', token);
        } else {
            localStorage.removeItem('cfm_token');
        }
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        return headers;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        const defaultOptions = {
            method: 'GET',
            headers: this.getHeaders()
        };
        
        const finalOptions = { ...defaultOptions, ...options };
        
        try {
            const response = await fetch(url, finalOptions);
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.setToken(null);
                    if (window.logout) {
                        window.logout();
                    }
                    throw new Error('Authentication required');
                }
                
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`API Request failed: ${endpoint}`, error);
            throw error;
        }
    }

    // Authentication APIs
    async login(platform, username, token = null) {
        const response = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ platform, username, token })
        });
        
        if (response.success) {
            this.setToken(response.token);
        }
        
        return response;
    }

    async verifyToken(token) {
        return await this.request('/auth/verify', {
            method: 'POST',
            body: JSON.stringify({ token })
        });
    }

    async logout() {
        try {
            await this.request('/auth/logout', { method: 'POST' });
        } finally {
            this.setToken(null);
        }
    }

    async getAuthStatus() {
        return await this.request('/auth/status');
    }

    // Platform Configuration APIs
    async getPlatforms() {
        return await this.request('/config/platforms');
    }

    async getBuckets(platform) {
        return await this.request(`/files/buckets/${platform}`);
    }

    async testConnection(platform) {
        return await this.request(`/config/test/${platform}`);
    }

    // File Management APIs
    async listFiles(platform, bucket, recordId = null) {
        const params = new URLSearchParams({ platform, bucket });
        if (recordId) {
            params.append('recordId', recordId);
        }
        return await this.request(`/files/list?${params}`);
    }

    async uploadFile(platform, bucket, fileName, file, recordId = null) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('platform', platform);
        formData.append('bucket', bucket);
        formData.append('fileName', fileName);
        
        if (recordId) {
            formData.append('recordId', recordId);
        }

        return await this.request('/files/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });
    }

    async deleteFile(platform, bucket, fileName) {
        return await this.request('/files/delete', {
            method: 'DELETE',
            body: JSON.stringify({ platform, bucket, fileName })
        });
    }

    async shareFile(platform, bucket, fileName, expirationHours) {
        return await this.request('/files/share', {
            method: 'POST',
            body: JSON.stringify({ platform, bucket, fileName, expirationHours })
        });
    }

    async downloadFile(platform, bucket, fileName, asBase64 = false) {
        const params = new URLSearchParams({ platform, bucket, fileName });
        if (asBase64) {
            params.append('asBase64', 'true');
        }
        return await this.request(`/files/download?${params}`);
    }

    // OCR APIs
    async extractOCR(platform, bucket, fileName, ocrType = 'document', async = false) {
        return await this.request('/ocr/extract', {
            method: 'POST',
            body: JSON.stringify({ platform, bucket, fileName, ocrType, async })
        });
    }

    async getOCRJobStatus(jobId) {
        return await this.request(`/ocr/job/${jobId}`);
    }

    async getOCRResults(jobId) {
        return await this.request(`/ocr/job/${jobId}/results`);
    }

    async analyzeDocument(platform, bucket, fileName, analysisType = 'general') {
        return await this.request('/ocr/analyze-document', {
            method: 'POST',
            body: JSON.stringify({ platform, bucket, fileName, analysisType })
        });
    }

    // Redaction APIs
    async preparePDFRedaction(platform, bucket, fileName) {
        return await this.request('/redaction/prepare', {
            method: 'POST',
            body: JSON.stringify({ platform, bucket, fileName })
        });
    }

    async applyRedactions(sessionId, redactions, redactionColor = '#000000') {
        return await this.request('/redaction/apply', {
            method: 'POST',
            body: JSON.stringify({ sessionId, redactions, redactionColor })
        });
    }

    async saveRedactedPDF(platform, bucket, fileName, redactedPdfBase64, originalFileName = null) {
        return await this.request('/redaction/save', {
            method: 'POST',
            body: JSON.stringify({ platform, bucket, fileName, redactedPdfBase64, originalFileName })
        });
    }

    async getRedactionSession(sessionId) {
        return await this.request(`/redaction/session/${sessionId}`);
    }

    async cleanupRedactionSession(sessionId) {
        return await this.request(`/redaction/session/${sessionId}`, {
            method: 'DELETE'
        });
    }

    async autoDetectSensitiveInfo(sessionId, detectionTypes, confidenceThreshold = 0.8) {
        return await this.request('/redaction/auto-detect', {
            method: 'POST',
            body: JSON.stringify({ sessionId, detectionTypes, confidenceThreshold })
        });
    }

    async generateRedactionPreview(sessionId, pageNumber, redactions, redactionColor = '#000000') {
        return await this.request('/redaction/preview', {
            method: 'POST',
            body: JSON.stringify({ sessionId, redactions, pageNumber, redactionColor })
        });
    }
		
		async salesforceJWTLogin(username, instanceUrl, recordId = null) {
		    const response = await this.request('/auth/salesforce-jwt', {
		        method: 'POST',
		        body: JSON.stringify({ 
		            username, 
		            instanceUrl, 
		            recordId 
		        })
		    });
    
		    if (response.success) {
		        this.setToken(response.token);
		    }
    
		    return response;
		}
}

// Create global instance
window.apiClient = new APIClient();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIClient;
}