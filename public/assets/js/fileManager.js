// Cloud File Manager - File Management JavaScript

/**
 * Open a file
 */
async function openFile(fileName) {
    try {
        showToast('Generating secure link...', 'info', 2000);
        
        const response = await window.apiClient.shareFile(
            CloudFileManager.state.selectedPlatform,
            CloudFileManager.state.selectedBucket,
            fileName,
            1 // 1 hour expiration
        );
        
        if (response.success) {
            window.open(response.shareUrl, '_blank');
            showToast('File opened in new tab', 'success');
        }
    } catch (error) {
        console.error('Failed to open file:', error);
        showToast('Failed to open file: ' + error.message, 'error');
    }
}

/**
 * Share a file
 */
async function shareFile(fileName) {
    try {
        const modal = createShareModal(fileName);
        showModalElement(modal);
        
    } catch (error) {
        console.error('Failed to open share modal:', error);
        showToast('Failed to open share options', 'error');
    }
}

/**
 * Delete a file
 */
// Replace deleteFile function:
async function deleteFile(fileName) {
    const displayName = getDisplayFileName(fileName);
    const confirmed = confirm(`Are you sure you want to delete "${displayName}"? This action cannot be undone.`);
    
    if (!confirmed) return;
    
    try {
        showToast('Deleting file...', 'info', 2000);
        
        const response = await window.apiClient.deleteFile(
            CloudFileManager.state.selectedPlatform,
            CloudFileManager.state.selectedBucket,
            fileName
        );
        
        if (response.success) {
            showToast('File deleted successfully', 'success');
            await loadFiles(); // Refresh file list
        }
    } catch (error) {
        console.error('Failed to delete file:', error);
        showToast('Failed to delete file: ' + error.message, 'error');
    }
}

/**
 * Perform OCR on a file
 */
async function performOCR(fileName) {
    try {
        const modal = createOCRModal(fileName);
        showModalElement(modal);
        
        await processOCR(fileName);
    } catch (error) {
        console.error('Failed to perform OCR:', error);
        showToast('Failed to perform OCR: ' + error.message, 'error');
        closeModal();
    }
}

/**
 * Process OCR for a file
 */
async function processOCR(fileName) {
    try {
        updateOCRProgress(10, 'Starting OCR extraction...');
        
        const response = await window.apiClient.extractOCR(
            CloudFileManager.state.selectedPlatform,
            CloudFileManager.state.selectedBucket,
            fileName,
            'document',
            false // Start with sync processing
        );
        
        if (response.success) {
            if (response.async) {
                updateOCRProgress(30, 'Processing large file asynchronously...');
                await pollOCRJob(response.jobId);
            } else {
                updateOCRProgress(100, 'OCR completed successfully!');
                displayOCRResults(response.extractedData, fileName);
            }
        }
    } catch (error) {
        console.error('OCR processing error:', error);
        updateOCRError(error.message);
    }
}

/**
 * Poll OCR job status for async processing
 */
async function pollOCRJob(jobId) {
    const maxPolls = 30;
    let pollCount = 0;
    
    const poll = async () => {
        try {
            pollCount++;
            
            const response = await window.apiClient.getOCRJobStatus(jobId);
            
            if (response.success) {
                const progress = response.progress || 0;
                updateOCRProgress(Math.max(30, progress), `Processing... ${response.status}`);
                
                if (response.status === 'COMPLETED') {
                    const resultsResponse = await window.apiClient.getOCRResults(jobId);
                    if (resultsResponse.success) {
                        updateOCRProgress(100, 'OCR completed successfully!');
                        displayOCRResults(resultsResponse.extractedData, response.fileName || 'file');
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
            updateOCRError(error.message);
        }
    };
    
    poll();
}

/**
 * Display OCR results
 */
// Update the displayOCRResults function in fileManager.js
function displayOCRResults(extractedData, fileName) {
    const resultsContainer = document.getElementById('ocrResults');
    const progressContainer = document.getElementById('ocrProgressContainer');
    
    if (progressContainer) {
        progressContainer.classList.add('slds-hide');
    }
    
    if (!extractedData || Object.keys(extractedData).length === 0) {
        resultsContainer.innerHTML = `
            <div class="slds-text-align_center slds-p-around_large">
                <p class="slds-text-color_weak">No text or data extracted from the document.</p>
                <button class="slds-button slds-button_neutral slds-m-top_medium" onclick="closeModal()">Close</button>
            </div>
        `;
    } else {
        const resultsHTML = Object.entries(extractedData).map(([key, value]) => `
            <div class="ocr-field slds-m-bottom_small">
                <div class="ocr-field-label slds-form-element__label">${escapeHtml(key)}</div>
                <div class="ocr-field-value slds-form-element__control">
                    <input type="text" class="slds-input" value="${escapeHtml(String(value))}" readonly />
                </div>
            </div>
        `).join('');
        
        resultsContainer.innerHTML = `
            <div class="slds-m-bottom_medium">
                <div class="slds-grid slds-grid_align-spread">
                    <h3 class="slds-text-heading_small">Extracted Data</h3>
                    <div class="slds-button-group">
                        <button class="slds-button slds-button_neutral" onclick="copyOCRResults()">
                            Copy All
                        </button>
                        <button class="slds-button slds-button_neutral" onclick="downloadOCRResults('${escapeHtml(fileName)}')">
                            Download JSON
                        </button>
                        <button class="slds-button slds-button_brand" onclick="closeModal()">
                            Close
                        </button>
                    </div>
                </div>
            </div>
            <div class="ocr-results">
                ${resultsHTML}
            </div>
        `;
    }
    
    resultsContainer.classList.remove('slds-hide');
    
    // Store results for copy/download functions
    window.currentOCRResults = extractedData;
}

/**
 * Update OCR progress
 */
function updateOCRProgress(progress, message) {
    const progressBar = document.getElementById('ocrProgressBar');
    const progressText = document.getElementById('ocrProgressText');
    const errorContainer = document.getElementById('ocrError');
    
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
    
    if (progressText) {
        progressText.textContent = message;
    }
    
    if (errorContainer) {
        errorContainer.classList.add('slds-hide');
    }
}

/**
 * Update OCR error state
 */
function updateOCRError(errorMessage) {
    const progressContainer = document.getElementById('ocrProgressContainer');
    const errorContainer = document.getElementById('ocrError');
    const errorText = document.getElementById('ocrErrorText');
    
    if (progressContainer) {
        progressContainer.classList.add('slds-hide');
    }
    
    if (errorContainer) {
        errorContainer.classList.remove('slds-hide');
    }
    
    if (errorText) {
        errorText.textContent = errorMessage;
    }
}

/**
 * Copy OCR results to clipboard
 */
async function copyOCRResults() {
    if (!window.currentOCRResults) {
        showToast('No OCR results to copy', 'warning');
        return;
    }
    
    try {
        const text = Object.entries(window.currentOCRResults)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
        
        await navigator.clipboard.writeText(text);
        showToast('OCR results copied to clipboard', 'success');
    } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        showToast('Failed to copy to clipboard', 'error');
    }
}

/**
 * Download OCR results as JSON
 */
function downloadOCRResults(fileName) {
    if (!window.currentOCRResults) {
        showToast('No OCR results to download', 'warning');
        return;
    }
    
    try {
        const dataStr = JSON.stringify(window.currentOCRResults, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ocr_results_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        
        showToast('OCR results downloaded', 'success');
    } catch (error) {
        console.error('Failed to download OCR results:', error);
        showToast('Failed to download OCR results', 'error');
    }
}

/**
 * Redact PDF file
 */
async function redactPDF(fileName) {
    try {
        showToast('Preparing PDF for redaction...', 'info');
        
        const response = await window.apiClient.preparePDFRedaction(
            CloudFileManager.state.selectedPlatform,
            CloudFileManager.state.selectedBucket,
            fileName
        );
        
        if (response.success) {
            const modal = createRedactionModal(fileName, response);
            showModalElement(modal);
        }
    } catch (error) {
        console.error('Failed to prepare PDF for redaction:', error);
        showToast('Failed to prepare PDF for redaction: ' + error.message, 'error');
    }
}

/**
 * File upload functionality
 */
let uploadState = {
    files: [],
    isMultipart: false,
    uploadProgress: 0
};

/**
 * Handle file selection for upload
 */
function handleFileSelection(event) {
    const files = event.target.files;
    
    if (files.length === 0) {
        return;
    }
    
    uploadState.files = Array.from(files);
    
    // Update UI with selected files
    updateFileSelectionUI();
}

/**
 * Update file selection UI
 */
function updateFileSelectionUI() {
    const container = document.getElementById('selectedFilesContainer');
    const uploadButton = document.getElementById('confirmUploadButton');
    
    if (uploadState.files.length === 0) {
        container.innerHTML = '<p class="slds-text-color_weak">No files selected</p>';
        uploadButton.disabled = true;
        return;
    }
    
    const filesHTML = uploadState.files.map((file, index) => `
        <div class="slds-pill slds-m-right_small slds-m-bottom_x-small">
            <span class="slds-pill__label">
                ${escapeHtml(file.name)} (${formatFileSize(file.size)})
            </span>
            <button class="slds-button slds-button_icon slds-pill__remove" 
                    onclick="removeFileFromUpload(${index})">
                <svg class="slds-button__icon" aria-hidden="true">
                    <use xlink:href="#close"></use>
                </svg>
            </button>
        </div>
    `).join('');
    
    container.innerHTML = filesHTML;
    uploadButton.disabled = false;
}

/**
 * Remove file from upload queue
 */
function removeFileFromUpload(index) {
    uploadState.files.splice(index, 1);
    updateFileSelectionUI();
}

/**
 * Perform file upload
 */
async function performFileUpload() {
    if (!window.selectedFiles || window.selectedFiles.length === 0) {
        showToast('No files selected for upload', 'warning');
        return;
    }
    
    try {
        showUploadProgress(true);
        
        for (let i = 0; i < window.selectedFiles.length; i++) {
            const file = window.selectedFiles[i];
            updateUploadProgress(i + 1, window.selectedFiles.length, `Uploading ${file.name}...`);
            
            await window.apiClient.uploadFile(
                CloudFileManager.state.selectedPlatform,
                CloudFileManager.state.selectedBucket,
                file.name,
                file,
                CloudFileManager.state.recordId
            );
        }
        
        showToast(`Successfully uploaded ${window.selectedFiles.length} file(s)`, 'success');
        closeModal();
        await loadFiles();
        
    } catch (error) {
        console.error('Upload failed:', error);
        showToast('Upload failed: ' + error.message, 'error');
    } finally {
        showUploadProgress(false);
        window.selectedFiles = [];
    }
}

/**
 * Upload a single file
 */
async function uploadSingleFile(file, currentFile, totalFiles) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('platform', CloudFileManager.state.selectedPlatform);
    formData.append('bucket', CloudFileManager.state.selectedBucket);
    formData.append('fileName', file.name);
    
    if (CloudFileManager.state.recordId) {
        formData.append('recordId', CloudFileManager.state.recordId);
    }
    
    updateUploadProgress(currentFile, totalFiles, `Uploading ${file.name}...`);
    
    const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${CloudFileManager.auth.token}`
        },
        body: formData
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Upload failed for ${file.name}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
        throw new Error(result.error || `Upload failed for ${file.name}`);
    }
}

/**
 * Show/hide upload progress
 */
function showUploadProgress(show) {
    const container = document.getElementById('uploadProgressContainer');
    const form = document.getElementById('uploadForm');
    
    if (show) {
        container.classList.remove('slds-hide');
        form.style.pointerEvents = 'none';
    } else {
        container.classList.add('slds-hide');
        form.style.pointerEvents = 'auto';
    }
}

/**
 * Update upload progress
 */
function updateUploadProgress(current, total, message) {
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');
    
    const percentage = Math.round((current / total) * 100);
    
    if (progressBar) {
        progressBar.style.width = `${percentage}%`;
    }
    
    if (progressText) {
        progressText.textContent = `${message} (${current}/${total})`;
    }
}

// Export functions for global access
window.openFile = openFile;
window.shareFile = shareFile;
window.deleteFile = deleteFile;
window.performOCR = performOCR;
window.redactPDF = redactPDF;
window.handleFileSelection = handleFileSelection;
window.removeFileFromUpload = removeFileFromUpload;
window.performFileUpload = performFileUpload;
window.copyOCRResults = copyOCRResults;
window.downloadOCRResults = downloadOCRResults;