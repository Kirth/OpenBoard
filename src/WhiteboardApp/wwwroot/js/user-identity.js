/**
 * Browser Fingerprinting Service for Anonymous User Identification
 * Generates consistent, privacy-respecting fingerprints for guest users
 */

// Prevent duplicate class declarations
if (typeof window.BrowserFingerprint !== 'undefined') {
    console.log('BrowserFingerprint already loaded, skipping redefinition');
} else {

window.BrowserFingerprint = class BrowserFingerprint {
    constructor() {
        this.storageKey = 'wbb_anonymous_user';
        this.consentKey = 'wbb_fingerprint_consent';
        this.version = '1.0';
        this.expirationDays = 90;
    }

    /**
     * Get or create anonymous user ID
     * @returns {Promise<string>} Anonymous user GUID with a0000000 prefix
     */
    async getAnonymousUserId() {
        try {
            // Check if we have consent for fingerprinting
            if (!this.hasConsent()) {
                return this.generateSessionGuid();
            }

            // Try to get existing identity from storage
            const existingUser = this.getStoredIdentity();
            if (existingUser && !this.isExpired(existingUser)) {
                this.updateLastSeen(existingUser);
                return existingUser.guid;
            }

            // Generate new fingerprint-based identity
            const fingerprint = await this.generateFingerprint();
            const guid = this.generateAnonymousGuid(fingerprint);
            
            this.storeIdentity({
                guid: guid,
                fingerprint: fingerprint,
                created: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                version: this.version
            });

            return guid;
        } catch (error) {
            console.warn('Fingerprinting failed, using session GUID:', error);
            return this.generateSessionGuid();
        }
    }

    /**
     * Generate browser fingerprint from various browser characteristics
     * @returns {Promise<string>} SHA-256 hash of fingerprint data
     */
    async generateFingerprint() {
        const fingerprintData = {
            // Canvas fingerprinting
            canvas: await this.getCanvasFingerprint(),
            webgl: this.getWebGLFingerprint(),
            
            // Browser characteristics
            userAgent: navigator.userAgent,
            language: navigator.language,
            languages: navigator.languages ? navigator.languages.join(',') : '',
            platform: navigator.platform,
            cookieEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack || 'unknown',
            
            // Screen properties
            screenResolution: `${screen.width}x${screen.height}`,
            availableResolution: `${screen.availWidth}x${screen.availHeight}`,
            colorDepth: screen.colorDepth,
            pixelRatio: window.devicePixelRatio || 1,
            
            // Timezone and locale
            timezone: this.getTimezone(),
            timezoneOffset: new Date().getTimezoneOffset(),
            
            // Hardware
            hardwareConcurrency: navigator.hardwareConcurrency || 0,
            maxTouchPoints: navigator.maxTouchPoints || 0,
            
            // Feature detection
            features: {
                localStorage: typeof(Storage) !== "undefined",
                sessionStorage: typeof(Storage) !== "undefined",
                indexedDB: !!window.indexedDB,
                webgl: !!this.getWebGLContext(),
                touch: 'ontouchstart' in window,
                webRTC: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
            }
        };

        // Generate hash from fingerprint data
        const dataString = JSON.stringify(fingerprintData, Object.keys(fingerprintData).sort());
        return await this.hashString(dataString);
    }

    /**
     * Generate canvas fingerprint
     * @returns {Promise<string>} Canvas fingerprint data
     */
    async getCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = 200;
            canvas.height = 50;
            
            // Draw text with various properties
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('WBB Fingerprint 🎨', 2, 15);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.fillText('WBB Fingerprint 🎨', 4, 17);
            
            // Draw some shapes
            ctx.beginPath();
            ctx.arc(50, 25, 20, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.fill();
            
            return canvas.toDataURL();
        } catch (error) {
            return 'canvas_error';
        }
    }

    /**
     * Get WebGL fingerprint
     * @returns {string} WebGL renderer info
     */
    getWebGLFingerprint() {
        try {
            const gl = this.getWebGLContext();
            if (!gl) return 'no_webgl';
            
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) + 
                       '|' + gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
            }
            
            return gl.getParameter(gl.RENDERER) + '|' + gl.getParameter(gl.VENDOR);
        } catch (error) {
            return 'webgl_error';
        }
    }

    /**
     * Get WebGL context
     * @returns {WebGLRenderingContext|null}
     */
    getWebGLContext() {
        try {
            const canvas = document.createElement('canvas');
            return canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        } catch (error) {
            return null;
        }
    }

    /**
     * Get timezone information
     * @returns {string} Timezone identifier
     */
    getTimezone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (error) {
            return 'unknown';
        }
    }

    /**
     * Generate SHA-256 hash of string
     * @param {string} str String to hash
     * @returns {Promise<string>} Hex encoded hash
     */
    async hashString(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Generate anonymous GUID from fingerprint hash
     * @param {string} fingerprint SHA-256 hash
     * @returns {string} GUID with a0000000 prefix
     */
    generateAnonymousGuid(fingerprint) {
        // Take first 32 characters of hash and format as GUID
        const hex = fingerprint.substring(0, 32);
        
        // Format as GUID with a0000000 prefix
        return `a0000000-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
    }

    /**
     * Generate session-only GUID for fallback
     * @returns {string} Session GUID with a0000000 prefix
     */
    generateSessionGuid() {
        // Generate random GUID for session-only use
        const randomHex = () => Math.floor(Math.random() * 16).toString(16);
        const generateSection = (length) => Array.from({length}, randomHex).join('');
        
        return `a0000000-${generateSection(4)}-${generateSection(4)}-${generateSection(4)}-${generateSection(12)}`;
    }

    /**
     * Check if user has consented to fingerprinting
     * @returns {boolean}
     */
    hasConsent() {
        try {
            return localStorage.getItem(this.consentKey) === 'true';
        } catch (error) {
            return false;
        }
    }

    /**
     * Set user consent for fingerprinting
     * @param {boolean} consent
     */
    setConsent(consent) {
        try {
            if (consent) {
                localStorage.setItem(this.consentKey, 'true');
            } else {
                localStorage.removeItem(this.consentKey);
                this.clearAnonymousData();
            }
        } catch (error) {
            console.warn('Failed to set consent:', error);
        }
    }

    /**
     * Get stored anonymous identity
     * @returns {Object|null}
     */
    getStoredIdentity() {
        try {
            const stored = localStorage.getItem(this.storageKey) || 
                          sessionStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Store anonymous identity
     * @param {Object} identity
     */
    storeIdentity(identity) {
        try {
            const data = JSON.stringify(identity);
            localStorage.setItem(this.storageKey, data);
            // Also store in sessionStorage as backup
            sessionStorage.setItem(this.storageKey, data);
        } catch (error) {
            // Fallback to sessionStorage only
            try {
                sessionStorage.setItem(this.storageKey, JSON.stringify(identity));
            } catch (sessionError) {
                console.warn('Failed to store anonymous identity:', sessionError);
            }
        }
    }

    /**
     * Update last seen timestamp
     * @param {Object} identity
     */
    updateLastSeen(identity) {
        identity.lastSeen = new Date().toISOString();
        this.storeIdentity(identity);
    }

    /**
     * Check if identity is expired
     * @param {Object} identity
     * @returns {boolean}
     */
    isExpired(identity) {
        if (!identity.lastSeen) return true;
        
        const lastSeen = new Date(identity.lastSeen);
        const now = new Date();
        const daysDiff = (now - lastSeen) / (1000 * 60 * 60 * 24);
        
        return daysDiff > this.expirationDays;
    }

    /**
     * Clear anonymous identity data
     */
    clearAnonymousData() {
        try {
            localStorage.removeItem(this.storageKey);
            sessionStorage.removeItem(this.storageKey);
        } catch (error) {
            console.warn('Failed to clear anonymous data:', error);
        }
    }

    /**
     * Get privacy status and controls
     * @returns {Object}
     */
    getPrivacyStatus() {
        return {
            hasConsent: this.hasConsent(),
            hasStoredIdentity: !!this.getStoredIdentity(),
            version: this.version
        };
    }
}

} // End of BrowserFingerprint class definition conditional

// Global instance (only create if not already exists)
if (!window.browserFingerprint && window.BrowserFingerprint) {
    window.browserFingerprint = new window.BrowserFingerprint();
}

// Global functions for Blazor interop (only define if not already exists)
if (!window.getAnonymousUserId) {
    window.getAnonymousUserId = async function() {
        return await window.browserFingerprint.getAnonymousUserId();
    };

    window.setFingerprintConsent = function(consent) {
        window.browserFingerprint.setConsent(consent);
    };

    window.clearAnonymousData = function() {
        window.browserFingerprint.clearAnonymousData();
    };

    window.getFingerprintPrivacyStatus = function() {
        return window.browserFingerprint.getPrivacyStatus();
    };

    // Auto-request consent on first load if not already set
    document.addEventListener('DOMContentLoaded', function() {
        // Only auto-request if we don't have a stored preference
        const hasPreference = localStorage.getItem('wbb_fingerprint_consent') !== null;
        if (!hasPreference) {
            // For now, we'll assume consent. In a real implementation,
            // you'd show a consent dialog here
            window.browserFingerprint.setConsent(true);
        }
    });
}