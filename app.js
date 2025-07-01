/**
 * Main Application Logic
 * Coordinates camera, object detection, and image enhancement
 */

class CameraApp {
    constructor() {
        // Core components
        this.objectDetector = null;
        this.imageEnhancer = null;
        
        // Camera elements
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        
        // App state
        this.streaming = false;
        this.currentOriginalImage = null;
        this.currentEnhancedImage = null;
        this.currentPrompt = null;
        
        // UI elements
        this.elements = {};
        
        // Touch handling for swipe gestures
        this.touch = {
            startX: 0,
            currentX: 0,
            isDragging: false
        };
        
        // Stats
        this.stats = {
            captureCount: 0,
            totalProcessingTime: 0,
            averageProcessingTime: 0
        };
    }

    /**
     * Initialize the application
     */
    async initialize() {
        try {
            // Initialize UI elements
            this.initializeElements();
            
            // Initialize object detector
            this.objectDetector = new ObjectDetector();
            
            // Initialize image enhancer
            this.imageEnhancer = new ImageEnhancer();
            this.setupImageEnhancerCallbacks();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Load saved API configuration
            this.loadApiConfig();
            
            this.updateStatus('Initializing camera...');
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.updateStatus('Failed to initialize application');
        }
    }

    /**
     * Initialize UI element references
     */
    initializeElements() {
        this.elements = {
            // Camera view
            loadingText: document.getElementById('loadingText'),
            cameraView: document.getElementById('cameraView'),
            videoElement: document.getElementById('videoElement'),
            canvasOutput: document.getElementById('canvasOutput'),
            captureBtn: document.getElementById('captureBtn'),
            statusBar: document.getElementById('statusBar'),
            detectionLabels: document.getElementById('detectionLabels'),
            detectionStats: document.getElementById('detectionStats'),
            
            // API configuration
            apiConfig: document.getElementById('apiConfig'),
            apiProvider: document.getElementById('apiProvider'),
            apiKey: document.getElementById('apiKey'),
            apiStatus: document.getElementById('apiStatus'),
            
            // Review mode
            reviewContainer: document.getElementById('reviewContainer'),
            originalImage: document.getElementById('originalImage'),
            enhancedImage: document.getElementById('enhancedImage'),
            imageSlider: document.getElementById('imageSlider'),
            enhancementInfo: document.getElementById('enhancementInfo'),
            promptText: document.getElementById('promptText'),
            processingTime: document.getElementById('processingTime'),
            
            // Processing overlay
            processingOverlay: document.getElementById('processingOverlay'),
            processingText: document.getElementById('processingText'),
            processingDetails: document.getElementById('processingDetails')
        };
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Capture button
        this.elements.captureBtn.addEventListener('click', () => this.capturePhoto());
        
        // API provider change
        this.elements.apiProvider.addEventListener('change', () => this.updateApiProvider());
        
        // Touch handlers for swipe gestures
        this.setupTouchHandlers();
        
        // Prevent default touch behaviors
        document.addEventListener('touchmove', (e) => {
            if (e.target.closest('#reviewContainer')) {
                e.preventDefault();
            }
        }, { passive: false });
        
        // Handle orientation changes
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.handleOrientationChange(), 500);
        });
    }

    /**
     * Setup touch handlers for swipe gestures
     */
    setupTouchHandlers() {
        const reviewContainer = this.elements.reviewContainer;
        const imageSlider = this.elements.imageSlider;
        
        reviewContainer.addEventListener('touchstart', (e) => {
            this.touch.startX = e.touches[0].clientX;
            this.touch.isDragging = true;
        });
        
        reviewContainer.addEventListener('touchmove', (e) => {
            if (!this.touch.isDragging) return;
            e.preventDefault();
            
            this.touch.currentX = e.touches[0].clientX;
            const deltaX = this.touch.currentX - this.touch.startX;
            const translateX = Math.max(-50, Math.min(0, (deltaX / window.innerWidth) * 100));
            
            imageSlider.style.transform = `translateX(${translateX}%)`;
        });
        
        reviewContainer.addEventListener('touchend', (e) => {
            if (!this.touch.isDragging) return;
            this.touch.isDragging = false;
            
            const deltaX = this.touch.currentX - this.touch.startX;
            const threshold = window.innerWidth * 0.3;
            
            if (Math.abs(deltaX) > threshold) {
                if (deltaX > 0) {
                    // Swipe right - save original
                    this.saveImage(this.currentOriginalImage, 'original');
                } else {
                    // Swipe left - save enhanced
                    this.saveImage(this.currentEnhancedImage, 'enhanced');
                }
            }
            
            // Reset position
            imageSlider.style.transform = 'translateX(0%)';
        });
    }

    /**
     * Initialize camera when OpenCV is ready
     */
    async initializeCamera() {
        try {
            this.video = this.elements.videoElement;
            this.canvas = this.elements.canvasOutput;
            this.ctx = this.canvas.getContext('2d');
            
            // Request camera access
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment', // Prefer back camera
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            
            this.video.srcObject = stream;
            this.video.play();
            
            // Wait for video metadata
            await new Promise((resolve) => {
                this.video.addEventListener('loadedmetadata', resolve, { once: true });
            });
            
            // Setup canvas dimensions
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            
            // Initialize object detector if available
            if (this.objectDetector) {
                const success = this.objectDetector.initialize(
                    this.video.videoWidth, 
                    this.video.videoHeight
                );
                
                if (success) {
                    this.streaming = true;
                    this.startVideoProcessing();
                    this.updateStatus('Camera ready with AI object detection!');
                } else {
                    throw new Error('Failed to initialize object detector');
                }
            } else {
                // Start without object detection
                this.streaming = true;
                this.startBasicVideoProcessing();
                this.updateStatus('Camera ready! (Object detection unavailable)');
            }
            
        } catch (error) {
            console.error('Camera initialization failed:', error);
            this.updateStatus(`Camera error: ${error.message}`);
        }
    }

    /**
     * Initialize basic version without OpenCV
     */
    async initializeBasic() {
        try {
            // Initialize UI elements
            this.initializeElements();
            
            // Initialize image enhancer only
            this.imageEnhancer = new ImageEnhancer();
            this.setupImageEnhancerCallbacks();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Load saved API configuration
            this.loadApiConfig();
            
            this.updateStatus('Initializing camera (without object detection)...');
            
            // Initialize camera
            await this.initializeCameraBasic();
            
        } catch (error) {
            console.error('Failed to initialize basic app:', error);
            this.updateStatus('Failed to initialize application');
        }
    }

    /**
     * Initialize camera without object detection
     */
    async initializeCameraBasic() {
        try {
            this.video = this.elements.videoElement;
            this.canvas = this.elements.canvasOutput;
            this.ctx = this.canvas.getContext('2d');
            
            // Request camera access
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            
            this.video.srcObject = stream;
            this.video.play();
            
            // Wait for video metadata
            await new Promise((resolve) => {
                this.video.addEventListener('loadedmetadata', resolve, { once: true });
            });
            
            // Setup canvas dimensions
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            
            this.streaming = true;
            this.startBasicVideoProcessing();
            this.updateStatus('Camera ready! Tap to capture photos.');
            
        } catch (error) {
            console.error('Basic camera initialization failed:', error);
            this.updateStatus(`Camera error: ${error.message}`);
        }
    }

    /**
     * Start basic video processing without object detection
     */
    startBasicVideoProcessing() {
        const processFrame = () => {
            if (!this.streaming) return;
            
            try {
                // Just display the video feed
                this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
                
                // Update UI to show no object detection
                this.elements.detectionLabels.innerHTML = '<div class="label-tag" style="background: rgba(255,165,0,0.2); border-color: #ffa500;">No object detection</div>';
                this.elements.detectionStats.textContent = 'Object detection unavailable - photos will use general enhancement';
                
                // Continue processing
                requestAnimationFrame(processFrame);
                
            } catch (error) {
                console.error('Frame processing error:', error);
                requestAnimationFrame(processFrame);
            }
        };
        
        processFrame();
    }

    /**
     * Start video processing loop
     */
    startVideoProcessing() {
        const processFrame = () => {
            if (!this.streaming) return;
            
            try {
                // Process frame with object detection
                const detectedObjects = this.objectDetector.processFrame(
                    this.ctx, 
                    this.video, 
                    this.canvas
                );
                
                // Update UI with detection results
                this.updateDetectionUI(detectedObjects);
                
                // Continue processing
                requestAnimationFrame(processFrame);
                
            } catch (error) {
                console.error('Frame processing error:', error);
                // Continue processing despite errors
                requestAnimationFrame(processFrame);
            }
        };
        
        processFrame();
    }

    /**
     * Update detection UI elements
     */
    updateDetectionUI(detectedObjects) {
        // Update detection labels
        const labelsContainer = this.elements.detectionLabels;
        labelsContainer.innerHTML = '';
        
        if (detectedObjects.length > 0) {
            const summary = this.objectDetector.getDetectionSummary();
            
            // Create label tags
            Object.keys(summary.types).forEach(type => {
                const count = summary.types[type].count;
                const confidence = Math.round(summary.types[type].avgConfidence * 100);
                
                const label = document.createElement('div');
                label.className = 'label-tag';
                label.textContent = count === 1 ? type : `${count} ${type}s`;
                label.title = `Confidence: ${confidence}%`;
                labelsContainer.appendChild(label);
            });
            
            // Update stats
            this.elements.detectionStats.textContent = 
                `${summary.totalObjects} objects detected (${Math.round(summary.avgConfidence * 100)}% avg confidence)`;
        } else {
            this.elements.detectionStats.textContent = 'No objects detected';
        }
    }

    /**
     * Capture photo and start enhancement process
     */
    async capturePhoto() {
        if (!this.streaming) return;
        
        try {
            // Disable capture button during processing
            this.elements.captureBtn.disabled = true;
            
            // Capture current frame
            const captureCanvas = document.createElement('canvas');
            captureCanvas.width = this.video.videoWidth;
            captureCanvas.height = this.video.videoHeight;
            const captureCtx = captureCanvas.getContext('2d');
            captureCtx.drawImage(this.video, 0, 0);
            
            this.currentOriginalImage = captureCanvas.toDataURL('image/jpeg', 0.9);
            
            // Get current detected objects
            const detectedObjects = this.objectDetector.detectedObjects;
            
            // Update stats
            this.stats.captureCount++;
            
            // Switch to review mode
            this.showReviewMode();
            
            // Start enhancement process
            const result = await this.imageEnhancer.enhanceImage(
                this.currentOriginalImage, 
                detectedObjects
            );
            
            if (result.success) {
                this.currentEnhancedImage = result.enhancedImageUrl;
                this.currentPrompt = result.prompt;
                
                // Update processing stats
                this.stats.totalProcessingTime += result.processingTime;
                this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.captureCount;
                
                // Update UI with results
                this.updateEnhancementResults(result);
            } else {
                this.handleEnhancementError(result.error);
            }
            
        } catch (error) {
            console.error('Capture failed:', error);
            this.handleEnhancementError(error.message);
        } finally {
            // Re-enable capture button
            this.elements.captureBtn.disabled = false;
        }
    }

    /**
     * Show review mode
     */
    showReviewMode() {
        this.elements.cameraView.style.display = 'none';
        this.elements.reviewContainer.classList.add('active');
        this.elements.originalImage.src = this.currentOriginalImage;
        this.elements.processingOverlay.classList.add('active');
    }

    /**
     * Update enhancement results in UI
     */
    updateEnhancementResults(result) {
        // Hide processing overlay
        this.elements.processingOverlay.classList.remove('active');
        
        // Update enhanced image
        this.elements.enhancedImage.src = result.enhancedImageUrl;
        
        // Update enhancement info
        this.elements.promptText.textContent = result.prompt;
        this.elements.processingTime.textContent = `${result.processingTime}ms (${result.method})`;
        
        // Show completion message
        this.updateStatus('Enhancement complete! Swipe to choose version.');
    }

    /**
     * Handle enhancement error
     */
    handleEnhancementError(errorMessage) {
        this.elements.processingOverlay.classList.remove('active');
        
        // Show error in UI
        this.elements.enhancementInfo.innerHTML = `
            <div style="color: #ff6b6b;">
                Enhancement failed: ${errorMessage}
            </div>
        `;
        
        // Hide enhanced image panel or show placeholder
        this.elements.enhancedImage.src = this.currentOriginalImage;
        this.elements.promptText.textContent = 'Enhancement failed - showing original';
        
        this.updateStatus('Enhancement failed. You can still save the original image.');
    }

    /**
     * Save image to device
     */
    saveImage(imageDataUrl, type) {
        try {
            const link = document.createElement('a');
            link.download = `ai-camera-${type}-${Date.now()}.jpg`;
            link.href = imageDataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.updateStatus(`${type.charAt(0).toUpperCase() + type.slice(1)} image saved!`);
            
            // Return to camera after short delay
            setTimeout(() => {
                this.backToCamera();
            }, 1000);
            
        } catch (error) {
            console.error('Save failed:', error);
            this.updateStatus('Failed to save image');
        }
    }

    /**
     * Return to camera view
     */
    backToCamera() {
        this.elements.reviewContainer.classList.remove('active');
        this.elements.cameraView.style.display = 'block';
        this.elements.processingOverlay.classList.remove('active');
        
        // Reset image slider position
        this.elements.imageSlider.style.transform = 'translateX(0%)';
        
        // Clear current images
        this.currentOriginalImage = null;
        this.currentEnhancedImage = null;
        this.currentPrompt = null;
        
        this.updateStatus('Ready to capture next photo.');
    }

    /**
     * Setup image enhancer callbacks
     */
    setupImageEnhancerCallbacks() {
        this.imageEnhancer.setCallbacks({
            onStart: () => {
                this.elements.processingText.textContent = 'Starting AI enhancement...';
                this.elements.processingDetails.textContent = '';
            },
            
            onUpdate: (message, progress) => {
                this.elements.processingText.textContent = message;
                this.elements.processingDetails.textContent = `${progress}% complete`;
            },
            
            onComplete: (enhancedImageUrl, prompt, processingTime) => {
                // Handled in updateEnhancementResults
            },
            
            onError: (error) => {
                console.error('Enhancement error:', error);
            }
        });
    }

    /**
     * Save API configuration
     */
    saveApiConfig() {
        const provider = this.elements.apiProvider.value;
        const apiKey = this.elements.apiKey.value;
        
        if (apiKey.trim() === '') {
            this.updateApiStatus('No API key provided - using demo mode');
            return;
        }
        
        // Configure image enhancer
        const success = this.imageEnhancer.configure(provider, apiKey);
        
        if (success) {
            // Save to local storage
            localStorage.setItem('ai-camera-api-provider', provider);
            localStorage.setItem('ai-camera-api-key', apiKey);
            
            this.updateApiStatus(`${provider} API configured successfully`);
            this.elements.apiConfig.style.display = 'none';
            
            // Test API configuration
            this.testApiConfiguration();
        } else {
            this.updateApiStatus('Failed to configure API');
        }
    }

    /**
     * Test API configuration
     */
    async testApiConfiguration() {
        this.updateApiStatus('Testing API configuration...');
        
        try {
            const result = await this.imageEnhancer.testApiConfig();
            this.updateApiStatus(result.message);
        } catch (error) {
            this.updateApiStatus(`API test failed: ${error.message}`);
        }
    }

    /**
     * Load saved API configuration
     */
    loadApiConfig() {
        const savedProvider = localStorage.getItem('ai-camera-api-provider');
        const savedApiKey = localStorage.getItem('ai-camera-api-key');
        
        if (savedProvider) {
            this.elements.apiProvider.value = savedProvider;
        }
        
        if (savedApiKey) {
            this.elements.apiKey.value = savedApiKey;
            this.imageEnhancer.configure(savedProvider || 'huggingface', savedApiKey);
            this.updateApiStatus(`${savedProvider || 'huggingface'} API loaded from storage`);
            this.elements.apiConfig.style.display = 'none';
        } else {
            this.updateApiStatus('No API configured - using demo mode');
        }
    }

    /**
     * Update API provider
     */
    updateApiProvider() {
        const provider = this.elements.apiProvider.value;
        const apiKey = this.elements.apiKey.value;
        
        if (apiKey) {
            this.imageEnhancer.configure(provider, apiKey);
            localStorage.setItem('ai-camera-api-provider', provider);
            this.updateApiStatus(`Switched to ${provider} API`);
        }
    }

    /**
     * Handle orientation changes
     */
    handleOrientationChange() {
        if (this.streaming && this.video && this.canvas) {
            // Adjust canvas size
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            
            // Reinitialize object detector if needed
            this.objectDetector.initialize(this.video.videoWidth, this.video.videoHeight);
        }
    }

    /**
     * Update status message
     */
    updateStatus(message) {
        this.elements.statusBar.textContent = message;
        console.log('Status:', message);
    }

    /**
     * Update API status
     */
    updateApiStatus(message) {
        this.elements.apiStatus.textContent = message;
        console.log('API Status:', message);
    }

    /**
     * Get application statistics
     */
    getStats() {
        return {
            ...this.stats,
            detectionStats: this.objectDetector ? this.objectDetector.getDetectionSummary() : null,
            enhancementStats: this.imageEnhancer ? this.imageEnhancer.getStats() : null
        };
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        // Stop video stream
        if (this.video && this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
        }
        
        // Cleanup object detector
        if (this.objectDetector) {
            this.objectDetector.cleanup();
        }
        
        this.streaming = false;
    }
}

// Global functions for HTML onclick handlers
window.saveApiConfig = function() {
    if (window.cameraApp) {
        window.cameraApp.saveApiConfig();
    }
};

window.capturePhoto = function() {
    if (window.cameraApp) {
        window.cameraApp.capturePhoto();
    }
};

window.backToCamera = function() {
    if (window.cameraApp) {
        window.cameraApp.backToCamera();
    }
};

// Initialize app when OpenCV is ready
window.onOpenCvReady = function() {
    console.log('OpenCV.js is ready');
    
    // Create and initialize app
    window.cameraApp = new CameraApp();
    window.cameraApp.initialize();
    
    // Hide loading text
    document.getElementById('loadingText').style.display = 'none';
    
    // Initialize camera
    window.cameraApp.initializeCamera();
};

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.cameraApp) {
        window.cameraApp.cleanup();
    }
});
