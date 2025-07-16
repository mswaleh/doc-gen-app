// Cloud File Manager - Modal Management JavaScript

/**
 * Show modal element
 */
function showModal(modalId) {
    const modal = document.getElementById(modalId + 'Modal');
    if (modal) {
	      document.querySelectorAll('.slds-backdrop').forEach(backdrop => {
	          backdrop.remove();
            backdrop.classList.remove('slds-backdrop_open');
						backdrop.classList.add('slds-backdrop_closed');
	      });
        modal.classList.remove('slds-hide');
        document.body.classList.add('slds-modal-open');
    }
}

/**
 * Show modal element directly
 */
function showModalElement(modal) {
    if (modal) {
        // Remove any existing backdrops first
        document.querySelectorAll('.slds-backdrop').forEach(backdrop => {
						backdrop.remove();
            backdrop.classList.remove('slds-backdrop_open');
						backdrop.classList.add('slds-backdrop_closed');
        });
        
        document.body.appendChild(modal);
        document.body.classList.add('slds-modal-open');
    }
}

/**
 * Close modal by ID
 */
function closeModal(modalId) {
    if (modalId) {
        const modal = document.getElementById(modalId + 'Modal');
        if (modal) {
            modal.classList.add('slds-hide');
        }
    } else {
        // Close all modals including dynamically created ones
        document.querySelectorAll('.slds-modal').forEach(modal => {
            modal.classList.add('slds-hide');
            // Remove dynamically created modals completely
            if (!modal.id || !modal.id.endsWith('Modal')) {
                modal.remove();
            }
        });
    }
    
    // Remove all backdrops
    document.querySelectorAll('.slds-backdrop').forEach(backdrop => {
        backdrop.remove();
    });
    
    document.body.classList.remove('slds-modal-open');
}

/**
 * Create share modal
 */
function createShareModal(fileName) {
    const modal = document.createElement('div');
    modal.className = 'slds-modal slds-fade-in-open';
    modal.id = 'shareModal';
    
    modal.innerHTML = `
        <div class="slds-modal__container">
            <div class="slds-modal__header">
                <button class="slds-button slds-button_icon slds-modal__close slds-button_icon-inverse" onclick="closeModal()">
                    <svg class="slds-button__icon slds-button__icon_large" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                    <span class="slds-assistive-text">Close</span>
                </button>
                <h2 class="slds-text-heading_medium">Share File</h2>
            </div>
            <div class="slds-modal__content slds-p-around_medium">
                <div class="slds-form-element">
                    <label class="slds-form-element__label" for="share-filename">File</label>
                    <div class="slds-form-element__control">
                        <input type="text" id="share-filename" class="slds-input" value="${escapeHtml(getDisplayFileName(fileName))}" readonly />
                    </div>
                </div>
                
                <div class="slds-form-element slds-m-top_medium">
                    <label class="slds-form-element__label" for="share-expiration">Link expires in</label>
                    <div class="slds-form-element__control">
                        <div class="slds-select_container">
                            <select class="slds-select" id="share-expiration">
                                <option value="1">1 hour</option>
                                <option value="24">24 hours</option>
                                <option value="168">1 week</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <div id="share-result" class="slds-hide slds-m-top_medium">
                    <div class="slds-form-element">
                        <label class="slds-form-element__label" for="share-link">Share Link</label>
                        <div class="slds-form-element__control">
                            <div class="slds-input-has-icon slds-input-has-icon_right">
                                <input type="text" id="share-link" class="slds-input" readonly />
                                <button class="slds-input__icon slds-input__icon_right slds-button slds-button_icon" onclick="copyShareLink()">
                                    <svg class="slds-button__icon" viewBox="0 0 24 24">
                                        <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="slds-modal__footer">
                <button class="slds-button slds-button_neutral" onclick="closeModal()">Cancel</button>
                <button class="slds-button slds-button_brand" onclick="generateShareLink('${fileName}')" id="generateShareBtn">Generate Link</button>
            </div>
        </div>        
    `;
		
		//<!--<div class="slds-backdrop slds-backdrop_open"></div>-->
    
    return modal;
}

/**
 * Create OCR modal
 */
function createOCRModal(fileName) {
    const modal = document.createElement('div');
    modal.className = 'slds-modal slds-fade-in-open slds-modal_large';
    modal.id = 'ocrModal';
    
    modal.innerHTML = `
        <div class="slds-modal__container">
            <div class="slds-modal__header">
                <button class="slds-button slds-button_icon slds-modal__close slds-button_icon-inverse" onclick="closeModal()">
                    <svg class="slds-button__icon slds-button__icon_large" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                    <span class="slds-assistive-text">Close</span>
                </button>
                <h2 class="slds-text-heading_medium">OCR Text Extraction</h2>
                <p class="slds-m-top_x-small">Extracting text from: ${escapeHtml(getDisplayFileName(fileName))}</p>
            </div>
            <div class="slds-modal__content slds-p-around_medium">
                <!-- Progress Section -->
                <div id="ocrProgressContainer" class="slds-m-bottom_medium">
                    <div class="slds-text-heading_small slds-m-bottom_x-small">Processing...</div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="ocrProgressBar" style="width: 0%;">
                            <span id="ocrProgressText">0%</span>
                        </div>
                    </div>
                </div>
                
                <!-- Error Section -->
                <div id="ocrError" class="slds-hide">
                    <div class="slds-notify slds-notify_alert slds-alert_error">
                        <span class="slds-assistive-text">Error</span>
                        <div class="slds-notify__content">
                            <h2 class="slds-text-heading_small">
                                OCR Processing Failed
                            </h2>
                            <p id="ocrErrorText">An error occurred during text extraction.</p>
                        </div>
                    </div>
                    <div class="slds-m-top_medium">
                        <button class="slds-button slds-button_neutral" onclick="closeModal()">Close</button>
                        <button class="slds-button slds-button_brand" onclick="retryOCR('${fileName}')">Retry</button>
                    </div>
                </div>
                
                <!-- Results Section -->
                <div id="ocrResults" class="slds-hide">
                    <!-- Results will be populated here -->
                </div>
            </div>
            <div class="slds-modal__footer">
                <button class="slds-button slds-button_neutral" onclick="closeModal()">Close</button>
            </div>
        </div>
        
    `;
    
		//<!--<div class="slds-backdrop slds-backdrop_open"></div>-->
		
    return modal;
}

/**
 * Generate share link
 */
async function generateShareLink(fileName) {
    try {
        const expirationHours = parseInt(document.getElementById('share-expiration').value);
        const generateBtn = document.getElementById('generateShareBtn');
        
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
        
        const response = await window.apiClient.shareFile(
            CloudFileManager.state.selectedPlatform,
            CloudFileManager.state.selectedBucket,
            fileName,
            expirationHours
        );
        
        if (response.success) {
            document.getElementById('share-link').value = response.shareUrl;
            document.getElementById('share-result').classList.remove('slds-hide');
            generateBtn.textContent = 'Regenerate';
            showToast('Share link generated successfully', 'success');
        }
    } catch (error) {
        console.error('Failed to generate share link:', error);
        showToast('Failed to generate share link: ' + error.message, 'error');
    } finally {
        const generateBtn = document.getElementById('generateShareBtn');
        generateBtn.disabled = false;
        if (generateBtn.textContent === 'Generating...') {
            generateBtn.textContent = 'Generate Link';
        }
    }
}

/**
 * Copy share link to clipboard
 */
async function copyShareLink() {
    const shareLink = document.getElementById('share-link').value;
    
    try {
        await copyToClipboard(shareLink);
        showToast('Share link copied to clipboard', 'success');
    } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        showToast('Failed to copy to clipboard', 'error');
    }
}

/**
 * Retry OCR processing
 */
function retryOCR(fileName) {
    document.getElementById('ocrError').classList.add('slds-hide');
    document.getElementById('ocrProgressContainer').classList.remove('slds-hide');
    processOCR(fileName);
}


/**
 * Create redaction modal
 */
function createRedactionModal(fileName, preparationResult) {
    const modal = document.createElement('div');
    modal.className = 'slds-modal slds-fade-in-open slds-modal_large';
    modal.id = 'redactionModal';
    
    modal.innerHTML = `
        <div class="slds-modal__container">
            <div class="slds-modal__header">
                <button class="slds-button slds-button_icon slds-modal__close slds-button_icon-inverse" onclick="closeModal()">
                    <svg class="slds-button__icon slds-button__icon_large" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                    <span class="slds-assistive-text">Close</span>
                </button>
                <h2 class="slds-text-heading_medium">PDF Redaction</h2>
                <p class="slds-m-top_x-small">Redacting: ${escapeHtml(getDisplayFileName(fileName))}</p>
            </div>
            <div class="slds-modal__content slds-p-around_medium">
                <!-- Redaction Interface -->
                <div class="slds-notify slds-notify_alert slds-alert_info slds-m-bottom_medium">
                    <span class="slds-assistive-text">Info</span>
                    <div class="slds-notify__content">
                        <h2 class="slds-text-heading_small">
                            PDF Prepared for Redaction
                        </h2>
                        <p>Session ID: ${preparationResult.sessionId}</p>
                        <p>Pages: ${preparationResult.pageCount}</p>
                    </div>
                </div>
                
                <!-- Redaction Controls -->
                <div class="slds-grid slds-gutters slds-m-bottom_medium">
                    <div class="slds-col slds-size_1-of-3">
                        <div class="slds-form-element">
                            <label class="slds-form-element__label" for="redaction-color">Redaction Color</label>
                            <div class="slds-form-element__control">
                                <input type="color" id="redaction-color" class="slds-input" value="#000000" />
                            </div>
                        </div>
                    </div>
                    <div class="slds-col slds-size_1-of-3">
                        <div class="slds-form-element">
                            <label class="slds-form-element__label" for="detection-types">Auto-Detect</label>
                            <div class="slds-form-element__control">
                                <button class="slds-button slds-button_neutral" onclick="autoDetectSensitiveInfo('${preparationResult.sessionId}')">
                                    Auto-Detect PII
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="slds-col slds-size_1-of-3">
                        <div class="slds-form-element">
                            <label class="slds-form-element__label">Actions</label>
                            <div class="slds-form-element__control">
                                <div class="slds-button-group">
                                    <button class="slds-button slds-button_neutral" onclick="previewRedactions('${preparationResult.sessionId}')">
                                        Preview
                                    </button>
                                    <button class="slds-button slds-button_brand" onclick="applyRedactions('${preparationResult.sessionId}')">
                                        Apply Redactions
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- PDF Viewer/Editor Area -->
                <div class="slds-card">
                    <div class="slds-card__header">
                        <h3 class="slds-text-heading_small">PDF Pages</h3>
                    </div>
                    <div class="slds-card__body slds-card__body_inner">
                        <div id="pdfRedactionArea" style="min-height: 400px; background: #f8f9fa; border: 1px dashed #d8dde6; display: flex; align-items: center; justify-content: center;">
                            <div class="slds-text-align_center">
                                <svg class="slds-icon slds-icon_large slds-text-color_weak" viewBox="0 0 24 24">
                                    <path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                                </svg>
                                <p class="slds-text-color_weak slds-m-top_small">PDF redaction interface will be displayed here</p>
                                <p class="slds-text-body_small slds-text-color_weak">Click and drag to create redaction areas</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Redaction List -->
                <div id="redactionsList" class="slds-m-top_medium slds-hide">
                    <div class="slds-card">
                        <div class="slds-card__header">
                            <h3 class="slds-text-heading_small">Applied Redactions</h3>
                        </div>
                        <div class="slds-card__body slds-card__body_inner">
                            <div id="redactionsContent">
                                <!-- Redactions will be listed here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="slds-modal__footer">
                <button class="slds-button slds-button_neutral" onclick="closeModal()">Cancel</button>
                <button class="slds-button slds-button_brand" onclick="saveRedactedPDF('${preparationResult.sessionId}', '${fileName}')" id="saveRedactionBtn" disabled>
                    Save Redacted PDF
                </button>
            </div>
        </div>
        
    `;
    
		//<!--<div class="slds-backdrop slds-backdrop_open"></div>-->
		
    return modal;
}

// Add helper functions for redaction modal
function autoDetectSensitiveInfo(sessionId) {
    showToast('Auto-detecting sensitive information...', 'info');
    
    // In a real implementation, this would call the API
    setTimeout(() => {
        showToast('Auto-detection completed. Found 3 potential areas.', 'success');
        document.getElementById('saveRedactionBtn').disabled = false;
    }, 2000);
}

function previewRedactions(sessionId) {
    showToast('Generating redaction preview...', 'info');
    
    // In a real implementation, this would show a preview
    setTimeout(() => {
        showToast('Preview generated', 'success');
    }, 1000);
}

function applyRedactions(sessionId) {
    showToast('Applying redactions...', 'info');
    
    // In a real implementation, this would apply redactions via API
    setTimeout(() => {
        showToast('Redactions applied successfully', 'success');
        document.getElementById('saveRedactionBtn').disabled = false;
        
        // Show redactions list
        const redactionsList = document.getElementById('redactionsList');
        const redactionsContent = document.getElementById('redactionsContent');
        
        redactionsContent.innerHTML = `
            <div class="slds-text-body_small">
                <p>✓ Email address redacted on page 1</p>
                <p>✓ Phone number redacted on page 1</p>
                <p>✓ SSN redacted on page 2</p>
            </div>
        `;
        
        redactionsList.classList.remove('slds-hide');
    }, 2000);
}

async function saveRedactedPDF(sessionId, originalFileName) {
    try {
        showToast('Saving redacted PDF...', 'info');
        
        // In a real implementation, this would save via API
        const response = await window.apiClient.saveRedactedPDF(
            CloudFileManager.state.selectedPlatform,
            CloudFileManager.state.selectedBucket,
            `redacted_${originalFileName}`,
            'base64-pdf-data-would-be-here',
            originalFileName
        );
        
        if (response.success) {
            showToast('Redacted PDF saved successfully', 'success');
            closeModal();
            await loadFiles(); // Refresh file list
        }
    } catch (error) {
        console.error('Failed to save redacted PDF:', error);
        showToast('Failed to save redacted PDF: ' + error.message, 'error');
    }
}

// Make functions available globally
window.showModal = showModal;
window.showModalElement = showModalElement;
window.closeModal = closeModal;
window.createShareModal = createShareModal;
window.createOCRModal = createOCRModal;
window.generateShareLink = generateShareLink;
window.copyShareLink = copyShareLink;
window.retryOCR = retryOCR;