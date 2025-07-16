// Cloud File Manager - Embedded JavaScript
// Save this as public/assets/js/embed.js

(function() {
    'use strict';

    // Global state for embedded application
    window.EmbedFileManager = {
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
            loading: false,
            initialized: false
        },
        config: {
            apiBaseUrl: '/api',
            maxFileSize: 100 * 1024 * 1024,
            supportedFormats: ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'doc', 'docx', 'txt', 'csv', 'xlsx', 'zip', 'mp4', 'avi', 'mov']
        },
        embed: {
            parentUrl: null,
            recordId: null,
            autoDetectedPlatform: null
        }
    };

    /**
     * Initialize embedded application
     */
		function initializeEmbeddedApp() {
		    console.log('Initializing Embedded Cloud File Manager...');
    
		    try {
		        // Hide initial loading
		        hideElement('initialLoading');
        
		        // Detect parent context
		        detectParentContext();
        
		        // Try authentication
		        attemptAuthentication().then(authenticated => {
		            if (authenticated) {
		                // Initialize UI components
		                initializeEmbeddedUI();
                
		                // Show main content
		                showElement('embedContent');
                
		                EmbedFileManager.state.initialized = true;
		                console.log('Embedded Cloud File Manager initialized successfully');
		            } else {
		                showAuthRequired('Authentication failed. Please provide valid credentials.');
		            }
		        }).catch(error => {
		            console.error('Authentication failed:', error);
		            showAuthRequired('Authentication failed: ' + error.message);
		        });
        
		    } catch (error) {
		        console.error('Failed to initialize embedded app:', error);
		        showAuthRequired('Initialization failed: ' + error.message);
		    }
		}

    /**
     * Detect parent context and platform
     */
    function detectParentContext() {
        const urlParams = new URLSearchParams(window.location.search);
        const parentUrl = document.referrer || window.location.ancestorOrigins?.[0];
        
        EmbedFileManager.embed.parentUrl = parentUrl;
        EmbedFileManager.embed.recordId = urlParams.get('recordId') || '';
        
        // Auto-detect platform
        if (parentUrl) {
            if (parentUrl.includes('salesforce.com') || parentUrl.includes('force.com')) {
                EmbedFileManager.embed.autoDetectedPlatform = 'salesforce';
            } else if (parentUrl.includes('servicenow.com') || parentUrl.includes('service-now.com')) {
                EmbedFileManager.embed.autoDetectedPlatform = 'servicenow';
            }
        }
        
        // Update platform info display
        updatePlatformInfo();
    }

    /**
     * Attempt authentication
     */
		async function attemptAuthentication() {
		    try {
		        const urlParams = new URLSearchParams(window.location.search);
		        const token = urlParams.get('token') || localStorage.getItem('cfm_embed_token');
        
		        if (token) {
		            // Verify token with backend
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
		                    EmbedFileManager.auth.token = token;
		                    EmbedFileManager.auth.user = data.user;
		                    EmbedFileManager.auth.platform = data.user?.platform;
                    
		                    // Set up API client
		                    if (window.apiClient) {
		                        window.apiClient.setToken(token);
		                    }
                    
		                    localStorage.setItem('cfm_embed_token', token);
		                    return true;
		                }
		            } catch (error) {
		                console.warn('Token verification failed:', error);
		            }
		        }
        
		        // Try auto-authentication for embedded context
		        return await attemptAutoAuthentication();
        
		    } catch (error) {
		        console.error('Authentication failed:', error);
		        return false;
		    }
		}

    /**
     * Attempt auto-authentication based on parent context
     */
		async function attemptAutoAuthentication() {
		    try {
		        // Try to get Salesforce context from parent LWC
		        const salesforceContext = await getSalesforceContextFromParent();
        
		        if (salesforceContext) {
		            return await authenticateWithSalesforce(salesforceContext);
		        }
        
		        // Fallback to standalone mode
		        return await createStandaloneAuth();
        
		    } catch (error) {
		        console.error('Auto-authentication failed:', error);
		        return false;
		    }
		}
		
		/**
		 * Get Salesforce context from parent LWC
		 */
		async function getSalesforceContextFromParent() {
		    return new Promise((resolve) => {
		        // Check URL parameters first
		        const urlParams = new URLSearchParams(window.location.search);
		        const username = urlParams.get('username');
		        const instanceUrl = urlParams.get('instanceUrl');
		        const recordId = urlParams.get('recordId');
        
		        if (username && instanceUrl) {
		            resolve({
		                username: username,
		                instanceUrl: instanceUrl,
		                recordId: recordId
		            });
		            return;
		        }
        
		        // Try to get context from parent window via postMessage
		        const messageHandler = (event) => {
		            if (event.data && event.data.type === 'SALESFORCE_CONTEXT') {
		                window.removeEventListener('message', messageHandler);
		                resolve(event.data.context);
		            }
		        };
        
		        window.addEventListener('message', messageHandler);
        
		        // Request context from parent
		        if (window.parent && window.parent !== window) {
		            window.parent.postMessage({
		                type: 'REQUEST_SALESFORCE_CONTEXT'
		            }, '*');
		        }
        
		        // Timeout after 3 seconds
		        setTimeout(() => {
		            window.removeEventListener('message', messageHandler);
		            resolve(null);
		        }, 3000);
		    });
		}
		
		/**
		 * Authenticate with Salesforce using JWT
		 */
		async function authenticateWithSalesforce(context) {
		    try {
		        const response = await window.apiClient.salesforceJWTLogin(
		            context.username,
		            context.instanceUrl,
		            context.recordId
		        );
        
		        if (response.success) {
		            EmbedFileManager.auth.token = response.token;
		            EmbedFileManager.auth.user = response.user;
		            EmbedFileManager.auth.platform = 'salesforce';
            
		            // Store Salesforce context
		            EmbedFileManager.salesforce = response.salesforce;
		            EmbedFileManager.embed.recordId = context.recordId;
            
		            localStorage.setItem('cfm_embed_token', response.token);
		            return true;
		        }
        
		        return false;
		    } catch (error) {
		        console.error('Salesforce authentication failed:', error);
		        return false;
		    }
		}
		
		/**
		 * Create standalone authentication as fallback
		 */
		async function createStandaloneAuth() {
		    try {
		        const response = await window.apiClient.login('standalone', 'embedded-user');
        
		        if (response.success) {
		            EmbedFileManager.auth.token = response.token;
		            EmbedFileManager.auth.user = response.user;
		            EmbedFileManager.auth.platform = 'standalone';
            
		            localStorage.setItem('cfm_embed_token', response.token);
		            return true;
		        }
        
		        return false;
		    } catch (error) {
		        console.error('Standalone authentication failed:', error);
		        return false;
		    }
		}

    /**
     * Initialize embedded UI components
     */
		function initializeEmbeddedUI() {
		    // Set default values
		    if (EmbedFileManager.embed.recordId) {
		        const recordInput = document.getElementById('embed-record-id');
		        if (recordInput) {
		            recordInput.value = EmbedFileManager.embed.recordId;
		            EmbedFileManager.state.recordId = EmbedFileManager.embed.recordId;
		        }
		    }
    
		    // Set default platform to GCP for demo
		    const platformSelect = document.getElementById('embed-platform');
		    if (platformSelect) {
		        platformSelect.value = 'gcp';
		        EmbedFileManager.state.selectedPlatform = 'gcp';
		        handleEmbedPlatformChange();
		    }
    
		    // Initialize drag and drop
		    initializeEmbedDragAndDrop();
    
		    // Update UI
		    updatePlatformInfo();
		    updateRecordInfo();
		}

    /**
     * Handle platform change in embedded mode
     */
		function handleEmbedPlatformChange() {
		    const platformSelect = document.getElementById('embed-platform');
		    const bucketSelect = document.getElementById('embed-bucket');
    
		    if (!platformSelect || !bucketSelect) return;
    
		    const platform = platformSelect.value;
		    EmbedFileManager.state.selectedPlatform = platform;
    
		    // Clear bucket selection
		    bucketSelect.innerHTML = '<option value="">Select Bucket</option>';
		    bucketSelect.disabled = !platform;
    
		    if (platform && EmbedFileManager.auth.token) {
		        loadEmbedBuckets(platform);
		    }
    
		    updatePlatformInfo();
		    clearEmbeddedFiles();
		}

    /**
     * Load buckets for embedded mode
     */
		async function loadEmbedBuckets(platform) {
		    if (!platform || !EmbedFileManager.auth.token) return;
    
		    try {
		        const response = await window.apiClient.getBuckets(platform);
        
		        if (response.success) {
		            const bucketSelect = document.getElementById('embed-bucket');
		            bucketSelect.innerHTML = '<option value="">Select Bucket</option>';
            
		            response.buckets.forEach(bucket => {
		                const option = document.createElement('option');
		                option.value = bucket;
		                option.textContent = bucket;
		                bucketSelect.appendChild(option);
		            });
            
		            bucketSelect.disabled = false;
            
		            if (response.buckets.length === 1) {
		                bucketSelect.value = response.buckets[0];
		                handleEmbedBucketChange();
		            }
		        }
		    } catch (error) {
		        console.error('Failed to load buckets:', error);
		        showEmbedToast('Failed to load buckets', 'error');
		    }
		}

    /**
     * Handle bucket change in embedded mode
     */
    function handleEmbedBucketChange() {
        const bucketSelect = document.getElementById('embed-bucket');
        if (!bucketSelect) return;
        
        const bucket = bucketSelect.value;
        EmbedFileManager.state.selectedBucket = bucket;
        
        updatePlatformInfo();
        
        if (bucket) {
            loadEmbeddedFiles();
        } else {
            clearEmbeddedFiles();
        }
    }

    /**
     * Handle record ID change in embedded mode
     */
    function handleEmbedRecordIdChange() {
        const recordInput = document.getElementById('embed-record-id');
        if (!recordInput) return;
        
        EmbedFileManager.state.recordId = recordInput.value.trim();
        EmbedFileManager.embed.recordId = EmbedFileManager.state.recordId;
        
        updateRecordInfo();
        
        // Reload files if bucket is selected
        if (EmbedFileManager.state.selectedBucket) {
            loadEmbeddedFiles();
        }
    }

    /**
     * Load files in embedded mode
     */
		async function loadEmbeddedFiles() {
		    if (!EmbedFileManager.state.selectedPlatform || !EmbedFileManager.state.selectedBucket || !EmbedFileManager.auth.token) {
		        return;
		    }
    
		    try {
		        showEmbedLoading();
        
		        const response = await window.apiClient.listFiles(
		            EmbedFileManager.state.selectedPlatform,
		            EmbedFileManager.state.selectedBucket,
		            EmbedFileManager.state.recordId
		        );
        
		        if (response.success) {
		            EmbedFileManager.state.files = response.files || [];
		            displayEmbeddedFiles();
		        }
		    } catch (error) {
		        console.error('Failed to load files:', error);
		        showEmbedToast('Failed to load files: ' + error.message, 'error');
		        showEmbedEmptyState();
		    } finally {
		        hideEmbedLoading();
		    }
		}

    /**
     * Display files in embedded mode
     */
		function displayEmbeddedFiles() {
		    const filesTable = document.getElementById('embedFilesTable');
		    const tableBody = document.getElementById('embedFilesTableBody');
		    const emptyState = document.getElementById('embedEmptyState');
    
		    if (EmbedFileManager.state.files.length === 0) {
		        filesTable.classList.add('slds-hide');
		        emptyState.classList.remove('slds-hide');
		        return;
		    }
    
		    // Hide empty state
		    if (emptyState) emptyState.classList.add('slds-hide');
    
		    // Show table and populate rows
		    filesTable.classList.remove('slds-hide');
		    tableBody.innerHTML = '';
    
		    EmbedFileManager.state.files.forEach(file => {
		        const row = createEmbedFileRow(file);
		        tableBody.appendChild(row);
		    });
		}
		
		// Add new function to create table rows for embed
		function createEmbedFileRow(file) {
		    const row = document.createElement('tr');
		    row.className = 'slds-hint-parent';
    
		    const fileName = getDisplayFileName(file.fileName);
		    const fileSize = formatFileSize(file.size);
		    const lastModified = file.lastModified ? new Date(file.lastModified).toLocaleDateString() : 'Unknown';
		    const contentType = file.contentType || 'Unknown';
    
		    // File Name Cell
		    const nameCell = document.createElement('td');
		    nameCell.setAttribute('data-label', 'File Name');
		    const nameDiv = document.createElement('div');
		    nameDiv.className = 'slds-truncate';
		    const nameButton = document.createElement('button');
		    nameButton.className = 'slds-button slds-button_base';
		    nameButton.textContent = fileName;
		    nameButton.onclick = () => openEmbedFile(file.fileName);
		    nameDiv.appendChild(nameButton);
		    nameCell.appendChild(nameDiv);
    
		    // Size Cell
		    const sizeCell = document.createElement('td');
		    sizeCell.setAttribute('data-label', 'Size');
		    const sizeDiv = document.createElement('div');
		    sizeDiv.className = 'slds-truncate';
		    sizeDiv.textContent = fileSize;
		    sizeCell.appendChild(sizeDiv);
    
		    // Type Cell
		    const typeCell = document.createElement('td');
		    typeCell.setAttribute('data-label', 'Type');
				const truncatedType = contentType.length > 20 ? contentType.substring(0, 20) + '...' : contentType;
				const typeDiv = document.createElement('div');
				typeDiv.className = 'slds-truncate';
				typeDiv.title = contentType; // Show full type on hover
				typeDiv.textContent = truncatedType;
				typeCell.appendChild(typeDiv);
    
		    // Date Cell
		    const dateCell = document.createElement('td');
		    dateCell.setAttribute('data-label', 'Last Modified');
		    const dateDiv = document.createElement('div');
		    dateDiv.className = 'slds-truncate';
		    dateDiv.textContent = lastModified;
		    dateCell.appendChild(dateDiv);
    
		    // Actions Cell
		    const actionsCell = createEmbedActionsCell(file);
    
		    // Append all cells to row
		    row.appendChild(nameCell);
		    row.appendChild(sizeCell);
		    row.appendChild(typeCell);
		    row.appendChild(dateCell);
		    row.appendChild(actionsCell);
    
		    return row;
		}
		
		// Add function to create actions cell for embed
		function createEmbedActionsCell(file) {
		    const actionsCell = document.createElement('td');
		    actionsCell.setAttribute('data-label', 'Actions');
    
		    const dropdownContainer = document.createElement('div');
		    dropdownContainer.className = 'custom-dropdown';
    
		    const triggerButton = document.createElement('button');
		    triggerButton.className = 'slds-button slds-button_icon slds-button_icon-border-filled';
		    triggerButton.setAttribute('aria-haspopup', 'true');
		    triggerButton.setAttribute('aria-expanded', 'false');
		    triggerButton.title = `More actions for ${file.fileName}`;
    
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
		    assistiveText.textContent = `More actions for ${file.fileName}`;
    
		    triggerButton.appendChild(icon);
		    triggerButton.appendChild(assistiveText);
    
		    // Create dropdown menu
		    const dropdownMenu = document.createElement('div');
		    dropdownMenu.className = 'custom-dropdown-menu';
		    dropdownMenu.setAttribute('role', 'menu');
    
		    const dropdownList = document.createElement('ul');
		    dropdownList.setAttribute('role', 'presentation');
		// Add menu items
		    const openItem = createMenuItem('Open', 'M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z', () => openEmbedFile(file.fileName));
		    if (openItem) dropdownList.appendChild(openItem);
    
		    const ocrItem = createMenuItem('OCR Extract', 'M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V10H15V8H9M9,12V14H13V12H9Z', () => performEmbedOCR(file.fileName), isOCRCompatible(file.fileName, file.contentType));
		    if (ocrItem) dropdownList.appendChild(ocrItem);
    
		    const redactItem = createMenuItem('Redact PDF', 'M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z', () => redactEmbedPDF(file.fileName), isPDFFile(file.fileName, file.contentType));
		    if (redactItem) dropdownList.appendChild(redactItem);
    
		    const shareItem = createMenuItem('Share', 'M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L15.96,7.19C16.5,7.69 17.21,8 18,8A3,3 0 0,0 21,5A3,3 0 0,0 18,2A3,3 0 0,0 15,5C15,5.24 15.04,5.47 15.09,5.7L8.04,9.81C7.5,9.31 6.79,9 6,9A3,3 0 0,0 3,12A3,3 0 0,0 6,15C6.79,15 7.5,14.69 8.04,14.19L15.16,18.34C15.11,18.55 15.08,18.77 15.08,19C15.08,20.61 16.39,21.91 18,21.91C19.61,21.91 20.92,20.61 20.92,19A1.92,1.92 0 0,0 19,17.08Z', () => shareEmbedFile(file.fileName));
		    if (shareItem) dropdownList.appendChild(shareItem);
    
		    const deleteItem = createMenuItem('Delete', 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z', () => deleteEmbedFile(file.fileName));
		    if (deleteItem) dropdownList.appendChild(deleteItem);
    
		    dropdownMenu.appendChild(dropdownList);
		    dropdownContainer.appendChild(triggerButton);
		    dropdownContainer.appendChild(dropdownMenu);
		    actionsCell.appendChild(dropdownContainer);
    
		    // Add click event to trigger button
		    triggerButton.addEventListener('click', (e) => {
		        e.stopPropagation();
		        toggleEmbedDropdown(dropdownMenu, triggerButton);
		    });
    
		    return actionsCell;
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
            closeAllEmbedDropdowns();
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
		
		// Add dropdown management functions for embed
		function toggleEmbedDropdown(dropdownMenu, triggerButton) {
		    const isOpen = dropdownMenu.classList.contains('show');
    
		    // Close all dropdowns first
		    closeAllEmbedDropdowns();
    
		    if (!isOpen) {
		        dropdownMenu.classList.add('show');
		        triggerButton.setAttribute('aria-expanded', 'true');
        
		        // Close on outside click
		        setTimeout(() => {
		            document.addEventListener('click', handleEmbedOutsideClick);
		        }, 0);
		    }
		}

		function closeAllEmbedDropdowns() {
		    document.querySelectorAll('.custom-dropdown-menu.show').forEach(menu => {
		        menu.classList.remove('show');
		    });
		    document.querySelectorAll('.custom-dropdown button[aria-expanded="true"]').forEach(btn => {
		        btn.setAttribute('aria-expanded', 'false');
		    });
		    document.removeEventListener('click', handleEmbedOutsideClick);
		}

		function handleEmbedOutsideClick(event) {
		    if (!event.target.closest('.custom-dropdown')) {
		        closeAllEmbedDropdowns();
		    }
		}    

    /**
     * File operations for embedded mode
     */
    function openEmbedFile(fileName) {
        showEmbedToast(`Opening ${getDisplayFileName(fileName)}...`, 'info');
        
        // Create secure share link and open
        generateEmbedShareLink(fileName, true);
    }

    function shareEmbedFile(fileName) {
        generateEmbedShareLink(fileName, false);
    }

    function deleteEmbedFile(fileName) {
        const displayName = getDisplayFileName(fileName);
        if (confirm(`Are you sure you want to delete "${displayName}"?`)) {
            performEmbedFileDelete(fileName);
        }
    }

    /**
     * Generate share link for embedded file
     */
		async function generateEmbedShareLink(fileName, openDirectly = false) {
		    if (!EmbedFileManager.auth.token) {
		        showEmbedToast('Authentication required', 'error');
		        return;
		    }
    
		    try {
		        const response = await window.apiClient.shareFile(
		            EmbedFileManager.state.selectedPlatform,
		            EmbedFileManager.state.selectedBucket,
		            fileName,
		            1 // 1 hour expiration
		        );
        
		        if (response.success) {
		            if (openDirectly) {
		                window.open(response.shareUrl, '_blank');
		            } else {
		                await copyToClipboard(response.shareUrl);
		                showEmbedToast('Share link copied to clipboard', 'success');
		            }
		        }
		    } catch (error) {
		        console.error('Failed to generate share link:', error);
		        showEmbedToast('Failed to generate share link', 'error');
		    }
		}

    /**
     * Delete file in embedded mode
     */
		async function performEmbedFileDelete(fileName) {
		    if (!EmbedFileManager.auth.token) {
		        showEmbedToast('Authentication required', 'error');
		        return;
		    }
    
		    try {
		        const response = await window.apiClient.deleteFile(
		            EmbedFileManager.state.selectedPlatform,
		            EmbedFileManager.state.selectedBucket,
		            fileName
		        );
        
		        if (response.success) {
		            EmbedFileManager.state.files = EmbedFileManager.state.files.filter(f => f.fileName !== fileName);
		            displayEmbeddedFiles();
		            showEmbedToast('File deleted successfully', 'success');
		        }
		    } catch (error) {
		        console.error('Failed to delete file:', error);
		        showEmbedToast('Failed to delete file', 'error');
		    }
		}

    /**
     * Refresh files in embedded mode
     */
    function refreshEmbeddedFiles() {
        loadEmbeddedFiles();
        showEmbedToast('Files refreshed', 'success');
    }

    /**
     * Show upload modal for embedded mode
     */
    function showEmbedUploadModal() {
        if (!EmbedFileManager.state.selectedPlatform || !EmbedFileManager.state.selectedBucket) {
            showEmbedToast('Please select a platform and bucket first', 'warning');
            return;
        }
        
        if (!EmbedFileManager.auth.token) {
            showEmbedToast('Authentication required', 'error');
            return;
        }
        
        // Create and show upload modal
        const modal = createEmbedUploadModal();
        showEmbedModal(modal);
    }

    /**
     * Create upload modal for embedded mode
     */
    function createEmbedUploadModal() {
        const modal = document.createElement('div');
        modal.className = 'slds-modal slds-fade-in-open';
        modal.id = 'embedUploadModal';
        
        modal.innerHTML = `
            <div class="slds-modal__container">
                <div class="slds-modal__header">
                    <button class="slds-button slds-button_icon slds-modal__close slds-button_icon-inverse" onclick="closeEmbedModal()">
                        <svg class="slds-button__icon slds-button__icon_large" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                        <span class="slds-assistive-text">Close</span>
                    </button>
                    <h2 class="slds-text-heading_medium">Upload Files</h2>
                </div>
                <div class="slds-modal__content slds-p-around_medium">
                    <div class="file-upload-area" id="embedUploadArea">
                        <input type="file" id="embedFileInput" multiple style="display: none;">
                        <div onclick="document.getElementById('embedFileInput').click()" style="cursor: pointer;">
                            <svg class="slds-icon slds-icon_large slds-text-color_weak slds-m-bottom_small" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                            </svg>
                            <p class="slds-text-heading_small">Drag and drop files here</p>
                            <p class="slds-text-color_weak">or click to browse</p>
                        </div>
                    </div>
                    <div id="embedSelectedFiles" class="slds-m-top_medium">
                        <p class="slds-text-color_weak">No files selected</p>
                    </div>
                    <div id="embedUploadProgress" class="slds-hide slds-m-top_medium">
                        <div class="progress-bar">
                            <div class="progress-fill" id="embedUploadProgressBar" style="width: 0%;">
                                <span id="embedUploadProgressText">0%</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="slds-modal__footer">
                    <button class="slds-button slds-button_neutral" onclick="closeEmbedModal()">Cancel</button>
                    <button class="slds-button slds-button_brand" onclick="performEmbedUpload()" id="embedUploadButton" disabled>Upload Files</button>
                </div>
            </div>
            <!--<div class="slds-backdrop slds-backdrop_open"></div>-->
        `;
        
        return modal;
    }

    /**
     * UI state management functions
     */
    function showEmbedLoading() {
        showElement('embedFilesLoading');
        hideElement('embedFilesGrid');
        hideElement('embedFilesList');
        hideElement('embedEmptyState');
    }

    function hideEmbedLoading() {
        hideElement('embedFilesLoading');
    }

    function showEmbedEmptyState() {
        hideElement('embedFilesLoading');
        hideElement('embedFilesGrid');
        hideElement('embedFilesList');
        showElement('embedEmptyState');
    }

    function clearEmbeddedFiles() {
        EmbedFileManager.state.files = [];
        showEmbedEmptyState();
    }

    function showAuthRequired(message = 'Authentication required') {
        hideElement('embedContent');
        const authRequired = document.getElementById('authRequired');
        if (authRequired) {
            authRequired.querySelector('p').textContent = message;
            showElement('authRequired');
        }
    }

    function updatePlatformInfo() {
        const platformInfo = document.getElementById('platformInfo');
        if (platformInfo) {
            if (EmbedFileManager.state.selectedPlatform && EmbedFileManager.state.selectedBucket) {
                platformInfo.textContent = `${EmbedFileManager.state.selectedPlatform.toUpperCase()} - ${EmbedFileManager.state.selectedBucket}`;
                platformInfo.classList.remove('slds-text-color_weak');
            } else if (EmbedFileManager.state.selectedPlatform) {
                platformInfo.textContent = `${EmbedFileManager.state.selectedPlatform.toUpperCase()} (select bucket)`;
                platformInfo.classList.add('slds-text-color_weak');
            } else {
                platformInfo.textContent = 'No platform selected';
                platformInfo.classList.add('slds-text-color_weak');
            }
        }
    }

    function updateRecordInfo() {
        const recordInfo = document.getElementById('recordInfo');
        if (recordInfo) {
            if (EmbedFileManager.state.recordId) {
                recordInfo.textContent = `Record: ${EmbedFileManager.state.recordId}`;
                recordInfo.classList.remove('slds-text-color_weak');
            } else {
                recordInfo.textContent = 'No record selected';
                recordInfo.classList.add('slds-text-color_weak');
            }
        }
    }

    /**
     * Settings panel toggle
     */
    function toggleEmbedSettings() {
        const settings = document.getElementById('embedSettings');
        if (settings) {
            settings.classList.toggle('slds-hide');
        }
    }

    /**
     * Utility functions
     */
    function showElement(id) {
        const element = document.getElementById(id);
        if (element) element.classList.remove('slds-hide');
    }

    function hideElement(id) {
        const element = document.getElementById(id);
        if (element) element.classList.add('slds-hide');
    }

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
        if (EmbedFileManager.state.recordId && fullPath.startsWith(EmbedFileManager.state.recordId + '/')) {
            fullPath = fullPath.substring(EmbedFileManager.state.recordId.length + 1);
        }
        
        const parts = fullPath.split(/[/\\]/);
        return parts[parts.length - 1];
    }

    function getFileIcon(fileName, contentType) {
        if (!fileName) return { class: 'other', path: 'M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z' };
        
        const extension = fileName.toLowerCase().split('.').pop();
        
        const iconMap = {
            pdf: { class: 'pdf', path: 'M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M9.5,11.5C9.5,12.33 8.83,13 8,13C7.17,13 6.5,12.33 6.5,11.5C6.5,10.67 7.17,10 8,10C8.83,10 9.5,10.67 9.5,11.5M17.5,16H14.5L13,13.5L11.5,16H6.5L10.25,9L17.5,16Z' },
            jpg: { class: 'image', path: 'M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19M8.5,13.5L11,16.5L14.5,12L19,18H5L8.5,13.5Z' },
            jpeg: { class: 'image', path: 'M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19M8.5,13.5L11,16.5L14.5,12L19,18H5L8.5,13.5Z' },
            png: { class: 'image', path: 'M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19M8.5,13.5L11,16.5L14.5,12L19,18H5L8.5,13.5Z' },
            mp4: { class: 'video', path: 'M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z' },
            doc: { class: 'document', path: 'M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z' },
            docx: { class: 'document', path: 'M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z' },
            xlsx: { class: 'document', path: 'M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z' },
            zip: { class: 'archive', path: 'M14,17V15.5H13V14H14V12.5H13V11H14V9.5H13V8H14V6.5H13V5H14V3.5H13V2H11V3.5H12V5H11V6.5H12V8H11V9.5H12V11H11V12.5H12V14H11V15.5H12V17H10V19H16V17H14Z' }
        };
        
        return iconMap[extension] || { class: 'other', path: 'M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z' };
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(textArea);
                return true;
            } catch (err) {
                document.body.removeChild(textArea);
                return false;
            }
        }
    }

    /**
     * Toast notifications for embedded mode
     */
		function showEmbedToast(message, type = 'info', duration = 5000) {
		    const container = document.getElementById('embedToastContainer');
		    if (!container) return;
    
		    const toast = document.createElement('div');
		    toast.className = `embed-toast ${type}`;
    
		    toast.innerHTML = `
		        <div class="slds-grid slds-gutters slds-grid_align-spread slds-grid_vertical-align-center">
		            <div class="slds-col slds-size_12-of-12 slds-has-flexi-truncate">
		                <p>${escapeHtml(message)}</p>
		            </div>
		            <div class="slds-col slds-no-flex">
		                <button class="slds-button slds-button_icon slds-button_icon-small" onclick="this.parentElement.parentElement.parentElement.remove()" style="background: transparent; border: none;">
		                    <svg class="slds-button__icon" viewBox="0 0 24 24" style="width: 1rem; height: 1rem;">
		                        <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
		                    </svg>
		                </button>
		            </div>
		        </div>
		    `;
    
		    container.appendChild(toast);
    
		    setTimeout(() => {
		        if (toast.parentElement) {
		            toast.remove();
		        }
		    }, duration);
		}

    /**
     * Modal management for embedded mode
     */
    function showEmbedModal(modal) {
        const container = document.getElementById('embedModalContainer');
        if (container && modal) {
            container.appendChild(modal);
            document.body.classList.add('slds-modal-open');
        }
    }

    function closeEmbedModal() {
        const container = document.getElementById('embedModalContainer');
        if (container) {
            container.innerHTML = '';
        }
        document.body.classList.remove('slds-modal-open');
    }

    /**
     * Drag and drop for embedded upload
     */
    function initializeEmbedDragAndDrop() {
        const dropZones = document.querySelectorAll('.file-upload-area, .embed-files-container');
        
        dropZones.forEach(zone => {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                zone.addEventListener(eventName, preventDefaults, false);
            });
            
            zone.addEventListener('dragenter', handleEmbedDragEnter);
            zone.addEventListener('dragover', handleEmbedDragOver);
            zone.addEventListener('dragleave', handleEmbedDragLeave);
            zone.addEventListener('drop', handleEmbedDrop);
        });
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function handleEmbedDragEnter(e) {
        e.currentTarget.classList.add('drag-over');
    }

    function handleEmbedDragOver(e) {
        // Already handled by preventDefaults
    }

    function handleEmbedDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }

    function handleEmbedDrop(e) {
        e.currentTarget.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            showEmbedUploadModal();
            setTimeout(() => {
                handleEmbedFileSelection({ target: { files: files } });
            }, 100);
        }
    }		

		function createEmbedOCRModal(fileName) {
		    const modal = document.createElement('div');
		    modal.className = 'slds-modal slds-fade-in-open slds-modal_large';
    
		    modal.innerHTML = `
		        <div class="slds-modal__container">
		            <div class="slds-modal__header">
		                <button class="slds-button slds-button_icon slds-modal__close slds-button_icon-inverse" onclick="closeEmbedModal()">
		                    <svg class="slds-button__icon slds-button__icon_large" viewBox="0 0 24 24">
		                        <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
		                    </svg>
		                    <span class="slds-assistive-text">Close</span>
		                </button>
		                <h2 class="slds-text-heading_medium">OCR Text Extraction</h2>
		                <p class="slds-m-top_x-small">Extracting text from: ${escapeHtml(getDisplayFileName(fileName))}</p>
		            </div>
		            <div class="slds-modal__content slds-p-around_medium">
		                <div id="embedOcrProgress" class="slds-m-bottom_medium">
		                    <div class="slds-text-heading_small slds-m-bottom_x-small">Processing...</div>
		                    <div class="progress-bar">
		                        <div class="progress-fill" id="embedOcrProgressBar" style="width: 0%;">
		                            <span id="embedOcrProgressText">Starting...</span>
		                        </div>
		                    </div>
		                </div>
		                <div id="embedOcrResults" class="slds-hide">
		                    <!-- Results will be populated here -->
		                </div>
		            </div>
		            <div class="slds-modal__footer">
		                <button class="slds-button slds-button_neutral" onclick="closeEmbedModal()">Close</button>
		            </div>
		        </div>
		        <!--<div class="slds-backdrop slds-backdrop_open"></div>-->
		    `;
    
		    return modal;
		}

		function updateEmbedOCRProgress(progress, message) {
		    const progressBar = document.getElementById('embedOcrProgressBar');
		    const progressText = document.getElementById('embedOcrProgressText');
    
		    if (progressBar) {
		        progressBar.style.width = `${progress}%`;
		    }
    
		    if (progressText) {
		        progressText.textContent = message;
		    }
		}

		function displayEmbedOCRResults(extractedData, fileName) {
		    const resultsContainer = document.getElementById('embedOcrResults');
		    const progressContainer = document.getElementById('embedOcrProgress');
    
		    if (progressContainer) {
		        progressContainer.classList.add('slds-hide');
		    }
    
		    if (!extractedData || Object.keys(extractedData).length === 0) {
		        resultsContainer.innerHTML = `
		            <div class="slds-text-align_center slds-p-around_large">
		                <p class="slds-text-color_weak">No text or data extracted from the document.</p>
		            </div>
		        `;
		    } else {
		        const resultsHTML = Object.entries(extractedData).map(([key, value]) => `
		            <div class="slds-form-element slds-m-bottom_small">
		                <label class="slds-form-element__label">${escapeHtml(key)}</label>
		                <div class="slds-form-element__control">
		                    <input type="text" class="slds-input" value="${escapeHtml(String(value))}" readonly />
		                </div>
		            </div>
		        `).join('');
        
		        resultsContainer.innerHTML = `
		            <div class="slds-m-bottom_medium">
		                <h3 class="slds-text-heading_small">Extracted Data</h3>
		                <p class="slds-text-body_small slds-text-color_weak">Field count: ${Object.keys(extractedData).length}</p>
		            </div>
		            <div class="slds-form">
		                ${resultsHTML}
		            </div>
		        `;
		    }
    
		    resultsContainer.classList.remove('slds-hide');
		}

		// Add utility functions if not already present
		
		function checkDependencies() {
		    const missing = [];
    
		    if (typeof window.apiClient === 'undefined') {
		        missing.push('apiClient');
		    }
    
		    if (missing.length > 0) {
		        console.error('Missing dependencies:', missing);
		        showAuthRequired(`Missing required scripts: ${missing.join(', ')}`);
		        return false;
		    }
    
		    return true;
		}
		
		// Add these functions to embed.js for OCR and PDF redaction

		async function performEmbedOCR(fileName) {
		    try {
		        showEmbedToast(`Starting OCR extraction for ${getDisplayFileName(fileName)}...`, 'info');
        
		        const modal = createEmbedOCRModal(fileName);
		        showEmbedModal(modal);
        
		        // Start OCR processing
		        await processEmbedOCR(fileName);
		    } catch (error) {
		        console.error('Failed to perform OCR:', error);
		        showEmbedToast('Failed to perform OCR: ' + error.message, 'error');
		        closeEmbedModal();
		    }
		}

		async function processEmbedOCR(fileName) {
		    try {
		        updateEmbedOCRProgress(10, 'Starting OCR extraction...');
        
		        const response = await window.apiClient.extractOCR(
		            EmbedFileManager.state.selectedPlatform,
		            EmbedFileManager.state.selectedBucket,
		            fileName,
		            'document',
		            false
		        );
        
		        if (response.success) {
		            if (response.async) {
		                updateEmbedOCRProgress(30, 'Processing large file asynchronously...');
		                await pollEmbedOCRJob(response.jobId);
		            } else {
		                updateEmbedOCRProgress(100, 'OCR completed successfully!');
		                displayEmbedOCRResults(response.extractedData, fileName);
		            }
		        }
		    } catch (error) {
		        console.error('OCR processing error:', error);
		        updateEmbedOCRProgress(100, 'OCR failed: ' + error.message);
		    }
		}

		async function pollEmbedOCRJob(jobId) {
		    const maxPolls = 30;
		    let pollCount = 0;
    
		    const poll = async () => {
		        try {
		            pollCount++;
            
		            const response = await window.apiClient.getOCRJobStatus(jobId);
            
		            if (response.success) {
		                const progress = response.progress || 0;
		                updateEmbedOCRProgress(Math.max(30, progress), `Processing... ${response.status}`);
                
		                if (response.status === 'COMPLETED') {
		                    const resultsResponse = await window.apiClient.getOCRResults(jobId);
		                    if (resultsResponse.success) {
		                        updateEmbedOCRProgress(100, 'OCR completed successfully!');
		                        displayEmbedOCRResults(resultsResponse.extractedData, response.fileName || 'file');
		                    }
		                } else if (response.status === 'FAILED') {
		                    throw new Error(response.error || 'OCR processing failed');
		                } else if (pollCount < maxPolls) {
		                    setTimeout(poll, 10000);
		                } else {
		                    throw new Error('OCR processing timed out');
		                }
		            }
		        } catch (error) {
		            updateEmbedOCRProgress(100, 'OCR failed: ' + error.message);
		        }
		    };
    
		    poll();
		}

		async function redactEmbedPDF(fileName) {
		    try {
		        showEmbedToast(`Preparing ${getDisplayFileName(fileName)} for redaction...`, 'info');
        
		        const response = await window.apiClient.preparePDFRedaction(
		            EmbedFileManager.state.selectedPlatform,
		            EmbedFileManager.state.selectedBucket,
		            fileName
		        );
        
		        if (response.success) {
		            const modal = createEmbedRedactionModal(fileName, response);
		            showEmbedModal(modal);
		        }
		    } catch (error) {
		        console.error('Failed to prepare PDF for redaction:', error);
		        showEmbedToast('Failed to prepare PDF for redaction: ' + error.message, 'error');
		    }
		}
		
		// Add this function to embed.js for embedded redaction modal
		function createEmbedRedactionModal(fileName, preparationResult) {
		    const modal = document.createElement('div');
		    modal.className = 'slds-modal slds-fade-in-open slds-modal_large';
    
		    modal.innerHTML = `
		        <div class="slds-modal__container">
		            <div class="slds-modal__header">
		                <button class="slds-button slds-button_icon slds-modal__close slds-button_icon-inverse" onclick="closeEmbedModal()">
		                    <svg class="slds-button__icon slds-button__icon_large" viewBox="0 0 24 24">
		                        <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
		                    </svg>
		                    <span class="slds-assistive-text">Close</span>
		                </button>
		                <h2 class="slds-text-heading_medium">PDF Redaction</h2>
		                <p class="slds-m-top_x-small">Redacting: ${escapeHtml(getDisplayFileName(fileName))}</p>
		            </div>
		            <div class="slds-modal__content slds-p-around_medium">
		                <div class="slds-notify slds-notify_alert slds-alert_info slds-m-bottom_medium">
		                    <span class="slds-assistive-text">Info</span>
		                    <div class="slds-notify__content">
		                        <h2 class="slds-text-heading_small">PDF Prepared for Redaction</h2>
		                        <p>Session ID: ${preparationResult.sessionId}</p>
		                        <p>Pages: ${preparationResult.pageCount}</p>
		                    </div>
		                </div>
		                <div class="slds-text-align_center slds-p-around_large">
		                    <p>PDF redaction interface would be displayed here</p>
		                    <button class="slds-button slds-button_brand slds-m-top_medium" onclick="closeEmbedModal()">Close</button>
		                </div>
		            </div>
		        </div>
		        <!--<div class="slds-backdrop slds-backdrop_open"></div>-->
		    `;
    
		    return modal;
		}

		// Helper functions for file type checking (add to embed.js if not already present)
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

		// Update the DOMContentLoaded event in embed.html:
		document.addEventListener('DOMContentLoaded', function() {
		    if (checkDependencies()) {
		        initializeEmbeddedApp();
		    }
		});

		// Export the new functions
		window.performEmbedOCR = performEmbedOCR;
		window.redactEmbedPDF = redactEmbedPDF;
		window.isOCRCompatible = isOCRCompatible;
		window.isPDFFile = isPDFFile;

    // Global functions for embedded mode
    window.initializeEmbeddedApp = initializeEmbeddedApp;
    window.handleEmbedPlatformChange = handleEmbedPlatformChange;
    window.handleEmbedBucketChange = handleEmbedBucketChange;
    window.handleEmbedRecordIdChange = handleEmbedRecordIdChange;
    window.refreshEmbeddedFiles = refreshEmbeddedFiles;
    window.showEmbedUploadModal = showEmbedUploadModal;
    window.toggleEmbedSettings = toggleEmbedSettings;
    window.openEmbedFile = openEmbedFile;
    window.shareEmbedFile = shareEmbedFile;
    window.deleteEmbedFile = deleteEmbedFile;
    window.closeEmbedModal = closeEmbedModal;

})();