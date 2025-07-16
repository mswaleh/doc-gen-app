// Cloud File Manager - Utility Functions (Clean Version)
// Save this as public/assets/js/utils.js

(function() {
    'use strict';

    // Utility functions namespace
    const Utils = {
        // File and data utilities
        formatBytes: function(bytes, decimals = 2) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        },

        // Function utilities
        debounce: function(func, wait, immediate) {
            let timeout;
            return function() {
                const context = this;
                const args = arguments;
                const later = function() {
                    timeout = null;
                    if (!immediate) func.apply(context, args);
                };
                const callNow = immediate && !timeout;
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
                if (callNow) func.apply(context, args);
            };
        },

        throttle: function(func, limit) {
            let inThrottle;
            return function() {
                const args = arguments;
                const context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        // Clipboard utilities
        copyToClipboard: async function(text) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.focus();
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
        },

        // ID generation
        generateUUID: function() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        // Validation utilities
        isValidEmail: function(email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        },

        isValidURL: function(string) {
            try {
                new URL(string);
                return true;
            } catch (_) {
                return false;
            }
        },

        // File utilities
        getFileExtension: function(filename) {
            return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
        },

        getFileNameWithoutExtension: function(filename) {
            return filename.replace(/\.[^/.]+$/, "");
        },

        // String utilities
        capitalizeFirst: function(string) {
            return string.charAt(0).toUpperCase() + string.slice(1);
        },

        toKebabCase: function(string) {
            return string
                .replace(/([a-z])([A-Z])/g, '$1-$2')
                .replace(/[\s_]+/g, '-')
                .toLowerCase();
        },

        toCamelCase: function(string) {
            return string
                .replace(/(?:^\w|[A-Z]|\b\w)/g, function(word, index) {
                    return index === 0 ? word.toLowerCase() : word.toUpperCase();
                })
                .replace(/\s+/g, '');
        },

        // Object utilities
        deepClone: function(obj) {
            if (obj === null || typeof obj !== "object") return obj;
            if (obj instanceof Date) return new Date(obj.getTime());
            if (obj instanceof Array) return obj.map(item => Utils.deepClone(item));
            if (obj instanceof Object) {
                const clonedObj = {};
                for (const key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        clonedObj[key] = Utils.deepClone(obj[key]);
                    }
                }
                return clonedObj;
            }
        },

        isEmpty: function(obj) {
            if (obj == null) return true;
            if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
            return Object.keys(obj).length === 0;
        },

        // URL utilities
        getUrlParameters: function() {
            const params = {};
            const urlParams = new URLSearchParams(window.location.search);
            for (const [key, value] of urlParams) {
                params[key] = value;
            }
            return params;
        },

        setUrlParameter: function(key, value) {
            const url = new URL(window.location);
            url.searchParams.set(key, value);
            window.history.pushState({}, '', url);
        },

        removeUrlParameter: function(key) {
            const url = new URL(window.location);
            url.searchParams.delete(key);
            window.history.pushState({}, '', url);
        },

        // Storage utilities with safe naming
        storage: {
            local: {
                set: function(key, value) {
                    try {
                        localStorage.setItem(key, JSON.stringify(value));
                        return true;
                    } catch (e) {
                        console.error('Error saving to localStorage:', e);
                        return false;
                    }
                },
                
                get: function(key, defaultValue = null) {
                    try {
                        const item = localStorage.getItem(key);
                        return item ? JSON.parse(item) : defaultValue;
                    } catch (e) {
                        console.error('Error reading from localStorage:', e);
                        return defaultValue;
                    }
                },
                
                remove: function(key) {
                    try {
                        localStorage.removeItem(key);
                        return true;
                    } catch (e) {
                        console.error('Error removing from localStorage:', e);
                        return false;
                    }
                },
                
                clear: function() {
                    try {
                        localStorage.clear();
                        return true;
                    } catch (e) {
                        console.error('Error clearing localStorage:', e);
                        return false;
                    }
                }
            },
            
            session: {
                set: function(key, value) {
                    try {
                        sessionStorage.setItem(key, JSON.stringify(value));
                        return true;
                    } catch (e) {
                        console.error('Error saving to sessionStorage:', e);
                        return false;
                    }
                },
                
                get: function(key, defaultValue = null) {
                    try {
                        const item = sessionStorage.getItem(key);
                        return item ? JSON.parse(item) : defaultValue;
                    } catch (e) {
                        console.error('Error reading from sessionStorage:', e);
                        return defaultValue;
                    }
                },
                
                remove: function(key) {
                    try {
                        sessionStorage.removeItem(key);
                        return true;
                    } catch (e) {
                        console.error('Error removing from sessionStorage:', e);
                        return false;
                    }
                },
                
                clear: function() {
                    try {
                        sessionStorage.clear();
                        return true;
                    } catch (e) {
                        console.error('Error clearing sessionStorage:', e);
                        return false;
                    }
                }
            }
        },

        // Drag and drop utilities
        initializeDragAndDrop: function() {
            const dropZones = document.querySelectorAll('.file-upload-area, .slds-card__body');
            
            dropZones.forEach(zone => {
                zone.addEventListener('dragenter', Utils.handleDragEnter);
                zone.addEventListener('dragover', Utils.handleDragOver);
                zone.addEventListener('dragleave', Utils.handleDragLeave);
                zone.addEventListener('drop', Utils.handleDrop);
            });
        },

        handleDragEnter: function(e) {
            e.preventDefault();
            e.currentTarget.classList.add('drag-over');
        },

        handleDragOver: function(e) {
            e.preventDefault();
        },

        handleDragLeave: function(e) {
            e.preventDefault();
            e.currentTarget.classList.remove('drag-over');
        },

        handleDrop: function(e) {
            e.preventDefault();
            e.currentTarget.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0 && window.showUploadModal && window.handleFileSelection) {
                window.showUploadModal();
                window.handleFileSelection({ target: { files: files } });
            }
        }
    };
		
		window.getDisplayFileName = function(fullPath) {
		    if (!fullPath) return '';
    
		    // Remove record ID prefix if present
		    const recordId = window.CloudFileManager?.state?.recordId || window.EmbedFileManager?.state?.recordId;
		    if (recordId && fullPath.startsWith(recordId + '/')) {
		        fullPath = fullPath.substring(recordId.length + 1);
		    }
    
		    const parts = fullPath.split(/[/\\]/);
		    return parts[parts.length - 1];
		};

    // Expose utilities to global scope with individual function names for backward compatibility
    window.formatBytes = Utils.formatBytes;
    window.debounce = Utils.debounce;
    window.throttle = Utils.throttle;
    window.copyToClipboard = Utils.copyToClipboard;
    window.generateUUID = Utils.generateUUID;
    window.isValidEmail = Utils.isValidEmail;
    window.isValidURL = Utils.isValidURL;
    window.getFileExtension = Utils.getFileExtension;
    window.getFileNameWithoutExtension = Utils.getFileNameWithoutExtension;
    window.capitalizeFirst = Utils.capitalizeFirst;
    window.toKebabCase = Utils.toKebabCase;
    window.toCamelCase = Utils.toCamelCase;
    window.deepClone = Utils.deepClone;
    window.isEmpty = Utils.isEmpty;
    window.getUrlParameters = Utils.getUrlParameters;
    window.setUrlParameter = Utils.setUrlParameter;
    window.removeUrlParameter = Utils.removeUrlParameter;
    window.initializeDragAndDrop = Utils.initializeDragAndDrop;

    // Expose the entire Utils object
    window.CFMUtils = Utils;

})();