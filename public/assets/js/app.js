// Cloud File Manager - Main Application JavaScript

// Global state
window.CloudFileManager = {
    auth: {
        token: null,
        user: null,
        platform: null
    },
    state: {
        selectedPlatform: '',
        selectedBucket: '',
        recordId: '',
        files: [],
        loading: false
    },
    config: {
        apiBaseUrl: '/api',
        maxFileSize: 100 * 1024 * 1024, // 100MB
        supportedFormats: ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'doc', 'docx', 'txt', 'csv', 'xlsx', 'zip', 'mp4', 'avi', 'mov']
    }
};

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

/**
 * Initialize the application
 */
function initializeApp() {
    console.log('Initializing Cloud File Manager...');
    
    // Check for existing authentication
    checkAuthStatus();
    
    // Initialize event listeners
    initializeEventListeners();
    
    // Initialize platform selection if not authenticated
    if (!CloudFileManager.auth.token) {
        showLoginSection();
    }
    
    // Initialize drag and drop
    initializeDragAndDrop();
    
    console.log('Cloud File Manager initialized');
}

/**
 * Check current authentication status
 */
async function checkAuthStatus() {
    try {
        const response = await window.apiClient.getAuthStatus();
        if (response.authenticated) {
            CloudFileManager.auth.token = window.apiClient.token;
            CloudFileManager.auth.user = response.user;
            CloudFileManager.auth.platform = response.user.platform;
            showFileManagerSection();
            await loadPlatforms();
        } else {
            showLoginSection();
        }
    } catch (error) {
        console.error('Auth status check failed:', error);
        showLoginSection();
    }
}

/**
 * Show login section
 */
function showLoginSection() {
    document.getElementById('loginSection').classList.remove('slds-hide');
    document.getElementById('fileManagerSection').classList.add('slds-hide');
}

/**
 * Show file manager section
 */
function showFileManagerSection() {
    document.getElementById('loginSection').classList.add('slds-hide');
    document.getElementById('fileManagerSection').classList.remove('slds-hide');
    
    // Initialize file manager components
    initializeFileManager();
}

/**
 * Initialize file manager components
 */
function initializeFileManager() {
    // Auto-detect record ID from URL if in embedded context
    const urlParams = new URLSearchParams(window.location.search);
    const recordId = urlParams.get('recordId');
    
    if (recordId) {
        document.getElementById('record-id-input').value = recordId;
        CloudFileManager.state.recordId = recordId;
    }
    
    // Load platforms and buckets
    loadPlatforms();
}

/**
 * Initialize event listeners
 */
function initializeEventListeners() {
    // Global error handler
    window.addEventListener('error', handleGlobalError);
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
}

/**
 * Handle platform change
 */
async function handlePlatformChange() {
    const platformSelect = document.getElementById('cloud-platform');
    const platform = platformSelect.value;
    
    CloudFileManager.state.selectedPlatform = platform;
    CloudFileManager.state.selectedBucket = '';
    CloudFileManager.state.files = [];
    
    // Clear bucket selection
    const bucketSelect = document.getElementById('storage-bucket');
    bucketSelect.innerHTML = '<option value="">Select Bucket</option>';
    bucketSelect.disabled = !platform;
    
    // Clear files display
    updateFilesDisplay();
    
    if (platform) {
        await loadBuckets(platform);
    }
    
    updateConnectionStatus();
    updateUIState();
}

/**
 * Load buckets for selected platform
 */
async function loadBuckets(platform) {
    if (!platform) return;
    
    try {
        showLoadingState('buckets');
        const response = await window.apiClient.getBuckets(platform);
        
        if (response.success) {
            const bucketSelect = document.getElementById('storage-bucket');
            bucketSelect.innerHTML = '<option value="">Select Bucket</option>';
            
            response.buckets.forEach(bucket => {
                const option = document.createElement('option');
                option.value = bucket;
                option.textContent = bucket;
                bucketSelect.appendChild(option);
            });
            
            bucketSelect.disabled = false;
            showToast(`Found ${response.buckets.length} buckets`, 'success');
            
            if (response.buckets.length === 1) {
                bucketSelect.value = response.buckets[0];
                await handleBucketChange();
            }
        }
    } catch (error) {
        console.error('Failed to load buckets:', error);
        showToast('Failed to load buckets: ' + error.message, 'error');
    } finally {
        hideLoadingState('buckets');
    }
}

/**
 * Handle bucket change
 */
async function handleBucketChange() {
    const bucketSelect = document.getElementById('storage-bucket');
    const bucket = bucketSelect.value;
    
    CloudFileManager.state.selectedBucket = bucket;
    CloudFileManager.state.files = [];
    
    updateFilesDisplay();
    updateUIState();
    
    if (bucket) {
        await loadFiles();
    }
}

/**
 * Handle record ID change
 */
function handleRecordIdChange() {
    const recordIdInput = document.getElementById('record-id-input');
    CloudFileManager.state.recordId = recordIdInput.value.trim();
    
    // Reload files if bucket is selected
    if (CloudFileManager.state.selectedBucket) {
        loadFiles();
    }
}

/**
 * Load files from selected bucket
 */
async function loadFiles() {
    if (!CloudFileManager.state.selectedPlatform || !CloudFileManager.state.selectedBucket) {
        return;
    }
    
    try {
        showLoadingState('files');
        const response = await window.apiClient.listFiles(
            CloudFileManager.state.selectedPlatform,
            CloudFileManager.state.selectedBucket,
            CloudFileManager.state.recordId
        );
        
        if (response.success) {
            CloudFileManager.state.files = response.files || [];
            updateFilesDisplay();
            updateFileCount();
        }
    } catch (error) {
        console.error('Failed to load files:', error);
        showToast('Failed to load files: ' + error.message, 'error');
    } finally {
        hideLoadingState('files');
    }
}

/**
 * Refresh files
 */
async function refreshFiles() {
    await loadFiles();
    showToast('Files refreshed', 'success');
}

/**
 * Update files display
 */
function updateFilesDisplay() {
    const tableContainer = document.getElementById('filesTableContainer');
    const tableBody = document.getElementById('filesTableBody');
    const emptyState = document.getElementById('emptyState');
    
    if (CloudFileManager.state.files.length === 0) {
        tableContainer.classList.add('slds-hide');
        emptyState.classList.remove('slds-hide');
        return;
    }
    
    emptyState.classList.add('slds-hide');
    tableContainer.classList.remove('slds-hide');
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    // Add file rows
    CloudFileManager.state.files.forEach(file => {
        const row = createFileRow(file);
        tableBody.appendChild(row);
    });
}

/**
 * Create file row element
 */
// REPLACE the entire createFileRow function in app.js with this:

function createFileRow(file) {
    const row = document.createElement('tr');
    row.className = 'slds-hint-parent';
    
    const fileName = getDisplayFileName(file.fileName);
    const fileSize = formatFileSize(file.size);
    const lastModified = file.lastModified ? new Date(file.lastModified).toLocaleDateString() : 'Unknown';
    const contentType = file.contentType || 'Unknown';
    
    // File Name Cell
    const nameCell = document.createElement('td');
    nameCell.setAttribute('data-label', 'File Name');
    nameCell.innerHTML = `
        <div class="slds-truncate">
            <button class="slds-button slds-button_base" onclick="openFile('${escapeHtml(file.fileName)}')">
                ${escapeHtml(fileName)}
            </button>
        </div>
    `;
    
    // Size Cell
    const sizeCell = document.createElement('td');
    sizeCell.setAttribute('data-label', 'Size');
    sizeCell.innerHTML = `<div class="slds-truncate">${fileSize}</div>`;
    
    // Type Cell
    const typeCell = document.createElement('td');
    typeCell.setAttribute('data-label', 'Type');
		const truncatedType = contentType.length > 20 ? contentType.substring(0, 20) + '...' : contentType;
		typeCell.setAttribute('title', contentType);
		typeCell.innerHTML = `<div class="slds-truncate" title="${escapeHtml(contentType)}">${escapeHtml(truncatedType)}</div>`;
    
    // Date Cell
    const dateCell = document.createElement('td');
    dateCell.setAttribute('data-label', 'Last Modified');
    dateCell.innerHTML = `<div class="slds-truncate">${lastModified}</div>`;
    
    // Actions Cell
    const actionsCell = document.createElement('td');
    actionsCell.setAttribute('data-label', 'Actions');
    
    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'custom-dropdown';
    
    const triggerButton = document.createElement('button');
    triggerButton.className = 'slds-button slds-button_icon slds-button_icon-border-filled';
    triggerButton.setAttribute('aria-haspopup', 'true');
    triggerButton.setAttribute('aria-expanded', 'false');
    triggerButton.title = `More actions for ${fileName}`;
    
    // Create icon SVG
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'slds-button__icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('viewBox', '0 0 24 24');
    const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    iconPath.setAttribute('fill', 'currentColor');
    iconPath.setAttribute('d', 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z');
    icon.appendChild(iconPath);
    
    const assistiveText = document.createElement('span');
    assistiveText.className = 'slds-assistive-text';
    assistiveText.textContent = `More actions for ${fileName}`;
    
    triggerButton.appendChild(icon);
    triggerButton.appendChild(assistiveText);
    
    // Create dropdown menu
    const dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'custom-dropdown-menu';
    dropdownMenu.setAttribute('role', 'menu');
    
    const dropdownList = document.createElement('ul');
    dropdownList.setAttribute('role', 'presentation');        
    
    // Add menu items
    const openItem = createMenuItem('Open', 'M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z', () => openFile(file.fileName));
    if (openItem) dropdownList.appendChild(openItem);
    
    const ocrItem = createMenuItem('OCR Extract', 'M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V10H15V8H9M9,12V14H13V12H9Z', () => performOCR(file.fileName), isOCRCompatible(file.fileName, contentType));
    if (ocrItem) dropdownList.appendChild(ocrItem);
    
    const redactItem = createMenuItem('Redact PDF', 'M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z', () => redactPDF(file.fileName), isPDFFile(file.fileName, contentType));
    if (redactItem) dropdownList.appendChild(redactItem);
    
    const shareItem = createMenuItem('Share', 'M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L15.96,7.19C16.5,7.69 17.21,8 18,8A3,3 0 0,0 21,5A3,3 0 0,0 18,2A3,3 0 0,0 15,5C15,5.24 15.04,5.47 15.09,5.7L8.04,9.81C7.5,9.31 6.79,9 6,9A3,3 0 0,0 3,12A3,3 0 0,0 6,15C6.79,15 7.5,14.69 8.04,14.19L15.16,18.34C15.11,18.55 15.08,18.77 15.08,19C15.08,20.61 16.39,21.91 18,21.91C19.61,21.91 20.92,20.61 20.92,19A1.92,1.92 0 0,0 19,17.08Z', () => shareFile(file.fileName));
    if (shareItem) dropdownList.appendChild(shareItem);
    
    const deleteItem = createMenuItem('Delete', 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z', () => deleteFile(file.fileName));
    if (deleteItem) dropdownList.appendChild(deleteItem);
    
    dropdownMenu.appendChild(dropdownList);
    dropdownContainer.appendChild(triggerButton);
    dropdownContainer.appendChild(dropdownMenu);
    actionsCell.appendChild(dropdownContainer);
    
    // Add click event to trigger button
    triggerButton.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCustomDropdown(dropdownMenu, triggerButton);
    });
    
    // Append all cells to row
    row.appendChild(nameCell);
    row.appendChild(sizeCell);
    row.appendChild(typeCell);
    row.appendChild(dateCell);
    row.appendChild(actionsCell);
    
    return row;
}

// Helper function to create menu items
function createMenuItem(label, iconPath, action, show = true) {
    if (!show) return null;
    
    const listItem = document.createElement('li');
    listItem.setAttribute('role', 'presentation');
    
    const link = document.createElement('a');
    link.href = '#';
    link.setAttribute('role', 'menuitem');
    link.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAllDropdowns();
        action();
    };
    
    const itemIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    itemIcon.setAttribute('aria-hidden', 'true');
    itemIcon.setAttribute('viewBox', '0 0 24 24');
    const itemIconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    itemIconPath.setAttribute('fill', 'currentColor');
    itemIconPath.setAttribute('d', iconPath);
    itemIcon.appendChild(itemIconPath);
    
    const labelText = document.createTextNode(label);
    
    link.appendChild(itemIcon);
    link.appendChild(labelText);
    listItem.appendChild(link);
    
    return listItem;
}

// Add these NEW functions at the end of app.js

function toggleCustomDropdown(dropdownMenu, triggerButton) {
    const isOpen = dropdownMenu.classList.contains('show');
    
    // Close all dropdowns first
    closeAllDropdowns();
    
    if (!isOpen) {
        dropdownMenu.classList.add('show');
        triggerButton.setAttribute('aria-expanded', 'true');
        
        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', handleOutsideClick);
        }, 0);
    }
}

function closeAllDropdowns() {
    document.querySelectorAll('.custom-dropdown-menu.show').forEach(menu => {
        menu.classList.remove('show');
    });
    document.querySelectorAll('.custom-dropdown button[aria-expanded="true"]').forEach(btn => {
        btn.setAttribute('aria-expanded', 'false');
    });
    document.removeEventListener('click', handleOutsideClick);
}

function handleOutsideClick(event) {
    if (!event.target.closest('.custom-dropdown')) {
        closeAllDropdowns();
    }
}

/**
 * Update file count display
 */
function updateFileCount() {
    const fileCountDisplay = document.getElementById('fileCountDisplay');
    const count = CloudFileManager.state.files.length;
    
    let message;
    if (count === 0) {
        message = 'No files found';
    } else if (count === 1) {
        message = '1 file';
    } else {
        message = `${count} files`;
    }
    
    if (CloudFileManager.state.recordId) {
        message += ` in record folder`;
    }
    
    fileCountDisplay.textContent = message;
}

/**
 * Update connection status
 */
function updateConnectionStatus() {
    const statusElement = document.getElementById('connectionStatus');
    const alertElement = document.getElementById('connectionAlert');
    const messageElement = document.getElementById('connectionMessage');
    
    if (!statusElement || !alertElement || !messageElement) {
        return; // Elements don't exist, exit gracefully
    }
    
    // Clear any existing timeout
    if (window.connectionStatusTimeout) {
        clearTimeout(window.connectionStatusTimeout);
    }
    
    if (CloudFileManager.state.selectedPlatform && CloudFileManager.state.selectedBucket) {
        statusElement.classList.remove('slds-hide');
        alertElement.className = 'slds-notify slds-notify_alert slds-alert_success';
        messageElement.innerHTML = `
            <svg class="slds-icon slds-icon_x-small slds-m-right_x-small" aria-hidden="true" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M11,16.5L6.5,12L7.91,10.59L11,13.67L16.59,8.09L18,9.5L11,16.5Z"/>
            </svg>
            Connected to ${CloudFileManager.state.selectedPlatform.toUpperCase()} - ${CloudFileManager.state.selectedBucket}
        `;
        
        // Auto-hide after 2 seconds
        window.connectionStatusTimeout = setTimeout(() => {
            statusElement.classList.add('slds-hide');
        }, 2000);
        
    } else if (CloudFileManager.state.selectedPlatform) {
        statusElement.classList.remove('slds-hide');
        alertElement.className = 'slds-notify slds-notify_alert slds-alert_warning';
        messageElement.innerHTML = `
            <svg class="slds-icon slds-icon_x-small slds-m-right_x-small" aria-hidden="true" viewBox="0 0 24 24">
                <path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
            ${CloudFileManager.state.selectedPlatform.toUpperCase()} connected - Select a bucket to continue
        `;
        
        // Auto-hide warning after 3 seconds (a bit longer for warnings)
        window.connectionStatusTimeout = setTimeout(() => {
            statusElement.classList.add('slds-hide');
        }, 3000);
        
    } else {
        statusElement.classList.add('slds-hide');
    }
}

/**
 * Update UI state based on current selections
 */
function updateUIState() {
    const uploadBtn = document.getElementById('uploadBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    
    const canUpload = CloudFileManager.state.selectedPlatform && CloudFileManager.state.selectedBucket;
    const canRefresh = CloudFileManager.state.selectedPlatform && CloudFileManager.state.selectedBucket;
    
    uploadBtn.disabled = !canUpload;
    refreshBtn.disabled = !canRefresh;
}

/**
 * Show loading state
 */
function showLoadingState(type) {
    CloudFileManager.state.loading = true;
    
    switch (type) {
        case 'files':
            document.getElementById('filesLoading').classList.remove('slds-hide');
            document.getElementById('filesTableContainer').classList.add('slds-hide');
            document.getElementById('emptyState').classList.add('slds-hide');
            break;
        case 'buckets':
            // Could show loading indicator for bucket selection
            break;
    }
}

/**
 * Hide loading state
 */
function hideLoadingState(type) {
    CloudFileManager.state.loading = false;
    
    switch (type) {
        case 'files':
            document.getElementById('filesLoading').classList.add('slds-hide');
            break;
    }
}

/**
 * Toggle platform selection section
 */
function togglePlatformSelection() {
    try {
        const body = document.getElementById('platformSelectionBody');
        const button = document.getElementById('togglePlatformBtn');
        
        if (!body) {
            console.error('Platform selection body element not found (ID: platformSelectionBody)');
            return;
        }
        
        if (!button) {
            console.error('Platform toggle button element not found (ID: togglePlatformBtn)');
            return;
        }
        
        // Toggle the visibility
        body.classList.toggle('slds-hide');
        
        // Update the icon direction
        const iconPath = button.querySelector('svg path');
        
        if (iconPath) {
            if (body.classList.contains('slds-hide')) {
                // Show chevron down (collapsed state)
                iconPath.setAttribute('d', 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z');
                button.setAttribute('aria-expanded', 'false');
            } else {
                // Show chevron up (expanded state)
                iconPath.setAttribute('d', 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z');
                button.setAttribute('aria-expanded', 'true');
            }
        } else {
            console.warn('SVG icon path not found in toggle button - icon will not change direction');
        }
        
    } catch (error) {
        console.error('Error in togglePlatformSelection:', error);
    }
}

/**
 * Show upload modal
 */
function showUploadModal() {
    if (!CloudFileManager.state.selectedPlatform || !CloudFileManager.state.selectedBucket) {
        showToast('Please select a platform and bucket first', 'warning');
        return;
    }
    
    showModal('upload');
}

/**
 * Show configuration modal
 */
function showConfigModal() {
    showModal('config');
}

/**
 * API call helper
 */
async function apiCall(endpoint, options = {}) {
    const url = CloudFileManager.config.apiBaseUrl + endpoint;
    
    const defaultOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (CloudFileManager.auth.token) {
        defaultOptions.headers['Authorization'] = `Bearer ${CloudFileManager.auth.token}`;
    }
    
    const finalOptions = { ...defaultOptions, ...options };
    
    const response = await fetch(url, finalOptions);
    
    if (!response.ok) {
        if (response.status === 401) {
            // Token expired or invalid
            logout();
            throw new Error('Authentication required');
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
    }
    
    return await response.json();
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info', duration = 5000) {
    const container = document.getElementById('toastContainer');
    
    const toast = document.createElement('div');
    toast.className = `slds-notify slds-notify_toast slds-alert_${type}`;
    toast.setAttribute('role', 'alert');
    
    toast.innerHTML = `
        <span class="slds-assistive-text">${type}</span>
        <div class="slds-notify__content">
            <h2 class="slds-text-heading_small">${escapeHtml(message)}</h2>
        </div>
        <button class="slds-button slds-button_icon slds-notify__close slds-button_icon-small" 
                onclick="this.parentElement.remove()">
            <svg class="slds-button__icon" aria-hidden="true">
                <use xlink:href="#close"></use>
            </svg>
            <span class="slds-assistive-text">Close</span>
        </button>
    `;
    
    container.appendChild(toast);
    
    // Auto-remove after duration
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, duration);
}

/**
 * Utility functions
 */
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

function getDisplayFileName(fullPath) {
    if (!fullPath) return '';
    
    // Remove record ID prefix if present
    if (CloudFileManager.state.recordId && fullPath.startsWith(CloudFileManager.state.recordId + '/')) {
        fullPath = fullPath.substring(CloudFileManager.state.recordId.length + 1);
    }
    
    const parts = fullPath.split(/[/\\]/);
    return parts[parts.length - 1];
}

function isOCRCompatible(fileName, contentType) {
    if (!fileName) return false;
    
    const extension = fileName.toLowerCase().split('.').pop();
    const ocrExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif'];
    
    return ocrExtensions.includes(extension) || 
           (contentType && (contentType.includes('pdf') || contentType.includes('image')));
}

function isPDFFile(fileName, contentType) {
    if (!fileName) return false;
    
    return fileName.toLowerCase().endsWith('.pdf') || 
           (contentType && contentType.includes('pdf'));
}

/**
 * Logout function
 */
function logout() {
    localStorage.removeItem('cfm_token');
    CloudFileManager.auth.token = null;
    CloudFileManager.auth.user = null;
    CloudFileManager.auth.platform = null;
    
    showLoginSection();
    showToast('Logged out successfully', 'info');
}

/**
 * Toggle user menu
 */
function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    dropdown.classList.toggle('slds-hide');
    
    // Close dropdown when clicking outside
    if (!dropdown.classList.contains('slds-hide')) {
        setTimeout(() => {
            document.addEventListener('click', function closeUserMenu(e) {
                if (!dropdown.contains(e.target)) {
                    dropdown.classList.add('slds-hide');
                    document.removeEventListener('click', closeUserMenu);
                }
            });
        }, 0);
    }
}

// Export functions to global scope for HTML onclick handlers
window.handlePlatformChange = handlePlatformChange;
window.handleBucketChange = handleBucketChange;
window.handleRecordIdChange = handleRecordIdChange;
window.refreshFiles = refreshFiles;
window.showUploadModal = showUploadModal;
window.showConfigModal = showConfigModal;
window.togglePlatformSelection = togglePlatformSelection;
window.toggleUserMenu = toggleUserMenu;
window.logout = logout;

/**
 * Handle global errors
 */
function handleGlobalError(event) {
    console.error('Global error:', event.error);
    
    // Show user-friendly error message
    showToast('An unexpected error occurred. Please try again.', 'error');
}

/**
 * Initialize drag and drop functionality
 */
function initializeDragAndDrop() {
    const dropZones = document.querySelectorAll('.file-upload-area, .slds-card__body');
    
    dropZones.forEach(zone => {
        zone.addEventListener('dragenter', handleDragEnter);
        zone.addEventListener('dragover', handleDragOver);
        zone.addEventListener('dragleave', handleDragLeave);
        zone.addEventListener('drop', handleDrop);
    });
}

/**
 * Handle drag enter
 */
function handleDragEnter(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

/**
 * Handle drag over
 */
function handleDragOver(e) {
    e.preventDefault();
}

/**
 * Handle drag leave
 */
function handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
}

/**
 * Handle file drop
 */
function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        // Show upload modal with dropped files
        showUploadModal();
        handleFileSelection({ target: { files: files } });
    }
}

/**
 * Load available platforms
 */
async function loadPlatforms() {
    try {
        const response = await window.apiClient.getPlatforms();
        
        if (response.success) {
            const platforms = response.platforms;
            
            // Auto-select a configured platform
            for (const [key, platform] of Object.entries(platforms)) {
                if (platform.configured) {
                    CloudFileManager.state.selectedPlatform = key;
                    const platformSelect = document.getElementById('cloud-platform');
                    if (platformSelect) {
                        platformSelect.value = key;
                        await handlePlatformChange();
                    }
                    break;
                }
            }
            
            updateConnectionStatus();
        }
    } catch (error) {
        console.error('Failed to load platforms:', error);
        showToast('Failed to load platform information: ' + error.message, 'error');
    }
}
