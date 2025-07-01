/**
 * Object Detection Module using OpenCV.js
 * Detects and classifies common objects including humans
 */

class ObjectDetector {
    constructor() {
        this.isInitialized = false;
        this.detectedObjects = [];
        this.src = null;
        this.dst = null;
        this.gray = null;
        this.contours = null;
        this.hierarchy = null;
        
        // Object classification thresholds and parameters
        this.minContourArea = 1500;
        this.humanAspectRatioMin = 0.3;
        this.humanAspectRatioMax = 0.8;
        this.faceDetectionEnabled = false;
        
        // Common object types we can detect
        this.objectTypes = {
            HUMAN: 'person',
            FACE: 'face',
            RECTANGULAR: 'rectangular object',
            CIRCULAR: 'circular object', 
            SQUARE: 'square object',
            VERTICAL: 'vertical object',
            HORIZONTAL: 'horizontal object',
            SMALL: 'small object',
            LARGE: 'large object',
            UNKNOWN: 'object'
        };
        
        // Color scheme for different object types
        this.objectColors = {
            [this.objectTypes.HUMAN]: '#ff6b6b',
            [this.objectTypes.FACE]: '#4ecdc4',
            [this.objectTypes.RECTANGULAR]: '#45b7d1',
            [this.objectTypes.CIRCULAR]: '#96ceb4',
            [this.objectTypes.SQUARE]: '#feca57',
            [this.objectTypes.VERTICAL]: '#ff9ff3',
            [this.objectTypes.HORIZONTAL]: '#54a0ff',
            [this.objectTypes.SMALL]: '#5f27cd',
            [this.objectTypes.LARGE]: '#00d2d3',
            [this.objectTypes.UNKNOWN]: '#ffffff'
        };
    }

    /**
     * Initialize OpenCV matrices and classifiers
     */
    initialize(videoWidth, videoHeight) {
        try {
            this.src = new cv.Mat(videoHeight, videoWidth, cv.CV_8UC4);
            this.dst = new cv.Mat(videoHeight, videoWidth, cv.CV_8UC1);
            this.gray = new cv.Mat();
            this.contours = new cv.MatVector();
            this.hierarchy = new cv.Mat();
            
            this.isInitialized = true;
            console.log('Object detector initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize object detector:', error);
            return false;
        }
    }

    /**
     * Process video frame and detect objects
     */
    processFrame(ctx, video, canvas) {
        if (!this.isInitialized) return [];

        try {
            // Clear previous detections
            this.detectedObjects = [];
            
            // Capture current frame
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            this.src.data.set(imageData.data);
            
            // Convert to grayscale for processing
            cv.cvtColor(this.src, this.gray, cv.COLOR_RGBA2GRAY);
            
            // Apply preprocessing
            this.preprocessImage();
            
            // Find contours
            cv.findContours(this.dst, this.contours, this.hierarchy, 
                           cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
            
            // Redraw original frame
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Analyze and classify each contour
            this.analyzeContours(ctx);
            
            // Draw detection results
            this.drawDetections(ctx);
            
            return this.detectedObjects;
            
        } catch (error) {
            console.error('Error processing frame:', error);
            return [];
        }
    }

    /**
     * Preprocess image for better contour detection
     */
    preprocessImage() {
        // Apply Gaussian blur to reduce noise
        cv.GaussianBlur(this.gray, this.gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
        
        // Apply adaptive threshold for better edge detection
        cv.adaptiveThreshold(this.gray, this.dst, 255, 
                           cv.ADAPTIVE_THRESH_GAUSSIAN_C, 
                           cv.THRESH_BINARY, 11, 2);
        
        // Apply morphological operations to clean up
        let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        cv.morphologyEx(this.dst, this.dst, cv.MORPH_CLOSE, kernel);
        kernel.delete();
    }

    /**
     * Analyze contours and classify objects
     */
    analyzeContours(ctx) {
        for (let i = 0; i < this.contours.size(); i++) {
            let contour = this.contours.get(i);
            let area = cv.contourArea(contour);
            
            // Filter out small contours
            if (area < this.minContourArea) {
                contour.delete();
                continue;
            }
            
            // Get bounding rectangle
            let rect = cv.boundingRect(contour);
            
            // Calculate geometric properties
            let aspectRatio = rect.width / rect.height;
            let extent = area / (rect.width * rect.height);
            let perimeter = cv.arcLength(contour, true);
            let circularity = 4 * Math.PI * area / (perimeter * perimeter);
            
            // Classify object type
            let objectType = this.classifyObject(rect, aspectRatio, extent, circularity, area);
            
            // Create detection object
            let detection = {
                type: objectType,
                rect: rect,
                area: area,
                aspectRatio: aspectRatio,
                circularity: circularity,
                extent: extent,
                confidence: this.calculateConfidence(objectType, aspectRatio, circularity, extent),
                center: {
                    x: rect.x + rect.width / 2,
                    y: rect.y + rect.height / 2
                }
            };
            
            this.detectedObjects.push(detection);
            contour.delete();
        }
        
        // Post-process detections
        this.postProcessDetections();
    }

    /**
     * Classify object based on geometric properties
     */
    classifyObject(rect, aspectRatio, extent, circularity, area) {
        // Human detection based on aspect ratio and size
        if (this.isLikelyHuman(rect, aspectRatio, area)) {
            return this.objectTypes.HUMAN;
        }
        
        // Circular objects (high circularity)
        if (circularity > 0.7) {
            return this.objectTypes.CIRCULAR;
        }
        
        // Square objects (aspect ratio close to 1)
        if (aspectRatio >= 0.8 && aspectRatio <= 1.2) {
            return this.objectTypes.SQUARE;
        }
        
        // Rectangular objects
        if (aspectRatio > 1.5 || aspectRatio < 0.67) {
            if (aspectRatio > 1.5) {
                return this.objectTypes.HORIZONTAL;
            } else {
                return this.objectTypes.VERTICAL;
            }
        }
        
        // Size-based classification
        if (area > 50000) {
            return this.objectTypes.LARGE;
        } else if (area < 5000) {
            return this.objectTypes.SMALL;
        }
        
        return this.objectTypes.RECTANGULAR;
    }

    /**
     * Determine if contour is likely a human
     */
    isLikelyHuman(rect, aspectRatio, area) {
        // Human-like aspect ratio (taller than wide)
        if (aspectRatio < this.humanAspectRatioMin || aspectRatio > this.humanAspectRatioMax) {
            return false;
        }
        
        // Reasonable size for human detection
        if (area < 10000 || area > 200000) {
            return false;
        }
        
        // Height should be significant portion of frame
        if (rect.height < 100) {
            return false;
        }
        
        return true;
    }

    /**
     * Calculate confidence score for detection
     */
    calculateConfidence(objectType, aspectRatio, circularity, extent) {
        let confidence = 0.5; // Base confidence
        
        switch (objectType) {
            case this.objectTypes.HUMAN:
                // Higher confidence for human-like aspect ratios
                if (aspectRatio >= 0.4 && aspectRatio <= 0.6) {
                    confidence = 0.8;
                } else {
                    confidence = 0.6;
                }
                break;
                
            case this.objectTypes.CIRCULAR:
                confidence = Math.min(0.9, circularity);
                break;
                
            case this.objectTypes.SQUARE:
                confidence = 1.0 - Math.abs(aspectRatio - 1.0);
                break;
                
            default:
                confidence = Math.min(0.7, extent);
        }
        
        return Math.max(0.1, Math.min(0.9, confidence));
    }

    /**
     * Post-process detections to remove duplicates and improve accuracy
     */
    postProcessDetections() {
        // Remove overlapping detections
        this.detectedObjects = this.removeOverlappingDetections(this.detectedObjects);
        
        // Sort by confidence
        this.detectedObjects.sort((a, b) => b.confidence - a.confidence);
        
        // Limit to top 10 detections
        if (this.detectedObjects.length > 10) {
            this.detectedObjects = this.detectedObjects.slice(0, 10);
        }
    }

    /**
     * Remove overlapping detections using non-maximum suppression
     */
    removeOverlappingDetections(detections) {
        const filtered = [];
        const overlapThreshold = 0.5;
        
        for (let i = 0; i < detections.length; i++) {
            let keep = true;
            
            for (let j = 0; j < filtered.length; j++) {
                const overlap = this.calculateOverlap(detections[i].rect, filtered[j].rect);
                if (overlap > overlapThreshold) {
                    keep = false;
                    break;
                }
            }
            
            if (keep) {
                filtered.push(detections[i]);
            }
        }
        
        return filtered;
    }

    /**
     * Calculate overlap between two rectangles
     */
    calculateOverlap(rect1, rect2) {
        const x1 = Math.max(rect1.x, rect2.x);
        const y1 = Math.max(rect1.y, rect2.y);
        const x2 = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
        const y2 = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);
        
        if (x2 <= x1 || y2 <= y1) return 0;
        
        const intersection = (x2 - x1) * (y2 - y1);
        const area1 = rect1.width * rect1.height;
        const area2 = rect2.width * rect2.height;
        const union = area1 + area2 - intersection;
        
        return intersection / union;
    }

    /**
     * Draw detection results on canvas
     */
    drawDetections(ctx) {
        this.detectedObjects.forEach((detection, index) => {
            const color = this.objectColors[detection.type] || this.objectColors[this.objectTypes.UNKNOWN];
            
            // Draw bounding box
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(detection.rect.x, detection.rect.y, 
                          detection.rect.width, detection.rect.height);
            
            // Draw label background
            const label = `${detection.type} (${Math.round(detection.confidence * 100)}%)`;
            ctx.font = '14px Arial';
            const textWidth = ctx.measureText(label).width;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(detection.rect.x, detection.rect.y - 25, textWidth + 10, 20);
            
            // Draw label text
            ctx.fillStyle = color;
            ctx.fillText(label, detection.rect.x + 5, detection.rect.y - 8);
            
            // Draw center point
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(detection.center.x, detection.center.y, 3, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    /**
     * Get detection summary for UI
     */
    getDetectionSummary() {
        const summary = {};
        let totalConfidence = 0;
        
        this.detectedObjects.forEach(detection => {
            if (!summary[detection.type]) {
                summary[detection.type] = {
                    count: 0,
                    avgConfidence: 0,
                    totalConfidence: 0
                };
            }
            
            summary[detection.type].count++;
            summary[detection.type].totalConfidence += detection.confidence;
            totalConfidence += detection.confidence;
        });
        
        // Calculate average confidence for each type
        Object.keys(summary).forEach(type => {
            summary[type].avgConfidence = summary[type].totalConfidence / summary[type].count;
        });
        
        return {
            types: summary,
            totalObjects: this.detectedObjects.length,
            avgConfidence: this.detectedObjects.length > 0 ? totalConfidence / this.detectedObjects.length : 0
        };
    }

    /**
     * Generate description for AI enhancement
     */
    generateSceneDescription() {
        if (this.detectedObjects.length === 0) {
            return "a general scene";
        }
        
        const summary = this.getDetectionSummary();
        const types = Object.keys(summary.types);
        
        let description = "";
        
        // Prioritize humans in description
        if (summary.types[this.objectTypes.HUMAN]) {
            const count = summary.types[this.objectTypes.HUMAN].count;
            description += count === 1 ? "a person" : `${count} people`;
        }
        
        // Add other significant objects
        const otherTypes = types.filter(type => type !== this.objectTypes.HUMAN);
        if (otherTypes.length > 0 && description) {
            description += " with ";
        }
        
        if (otherTypes.length > 0) {
            description += otherTypes.slice(0, 3).map(type => {
                const count = summary.types[type].count;
                return count === 1 ? `a ${type}` : `${count} ${type}s`;
            }).join(", ");
        }
        
        return description || "various objects";
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.src) this.src.delete();
        if (this.dst) this.dst.delete();
        if (this.gray) this.gray.delete();
        if (this.contours) this.contours.delete();
        if (this.hierarchy) this.hierarchy.delete();
        this.isInitialized = false;
    }
}

// Export for use in main app
window.ObjectDetector = ObjectDetector;
