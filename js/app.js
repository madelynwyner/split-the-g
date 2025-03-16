// DOM Elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('captureBtn');
const resultDiv = document.getElementById('result');
const scoreSpan = document.getElementById('score');
const feedbackP = document.getElementById('feedback');
const tryAgainBtn = document.getElementById('tryAgainBtn');
const emptyPercentageSpan = document.getElementById('emptyPercentage');
const beerPercentageSpan = document.getElementById('beerPercentage');

const ctx = canvas.getContext('2d');
let stream = null;

// Set up canvas size
let canvasWidth = 640;
let canvasHeight = 480;

// Define analysis regions (matching guide outline)
const analysisRegions = {
    left: 0.2,    // 20% from left
    right: 0.8,   // 80% from left
    top: 0.1,     // 10% from top
    bottom: 0.9,  // 90% from top
    targetY: 0.5  // Arrow position (50% from top)
};

// Function to resize canvas while maintaining aspect ratio
function resizeCanvas() {
    const containerWidth = video.offsetWidth;
    const aspectRatio = canvasHeight / canvasWidth;
    
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = (containerWidth * aspectRatio) + 'px';
    
    // Keep the drawing context size consistent
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
}

// Call resize on init and window resize
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Check if we're on HTTPS or localhost
if (window.location.protocol !== 'https:' && 
    !window.location.hostname.includes('localhost') && 
    !window.location.hostname.includes('127.0.0.1') &&
    !window.location.hostname.includes('0.0.0.0')) {
    alert('This app requires HTTPS to access the camera. Please use HTTPS or localhost.');
}

// Initialize camera
async function initCamera() {
    try {
        // First try the environment camera (back camera)
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { exact: "environment" },
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });
        } catch (backCameraError) {
            console.log('Back camera failed, trying any camera:', backCameraError);
            // If back camera fails, try any camera
            stream = await navigator.mediaDevices.getUserMedia({
                video: true
            });
        }

        video.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play().then(() => {
                    resolve();
                }).catch(err => {
                    console.error('Error playing video:', err);
                    resolve(); // Still resolve to allow the app to continue
                });
            };
        });
        
        // Show capture button when camera is ready
        captureBtn.style.display = 'block';
        
    } catch (err) {
        console.error('Error accessing camera:', err);
        let errorMessage = 'Unable to access camera. ';
        
        if (err.name === 'NotAllowedError') {
            errorMessage += 'Please ensure you have granted camera permissions. You may need to:\n\n';
            errorMessage += '1. Check site settings in your browser\n';
            errorMessage += '2. Reload the page\n';
            errorMessage += '3. If using Chrome, try clearing site settings and granting permissions again';
        } else if (err.name === 'NotFoundError') {
            errorMessage += 'No camera found on your device.';
        } else if (err.name === 'NotReadableError') {
            errorMessage += 'Camera may be in use by another application.';
        }
        
        alert(errorMessage);
    }
}

// Capture button handler
captureBtn.addEventListener('click', () => {
    // Hide video and show canvas
    video.style.display = 'none';
    canvas.style.display = 'block';
    
    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Process the image
    processImage();
});

// Process image and calculate score
async function processImage() {
    try {
        // Get image data for analysis
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (!imageData || !imageData.data) {
            throw new Error('Failed to get image data from canvas');
        }
        
        // Find the beer level using color analysis
        const analysis = analyzeBeerLevel(imageData.data, canvas.width, canvas.height);
        if (!analysis) {
            throw new Error('Failed to analyze beer level');
        }
        
        window.lastAnalysis = analysis; // Store for use in drawPercentageOverlay
        
        // Draw debug visualization with glass boundaries first
        drawDebugVisualization(
            analysis.debugData,
            analysis.glassTop,
            analysis.glassBottom,
            analysis.liquidLevel,
            analysis.leftRimTop,
            analysis.rightRimTop
        );
        
        // Calculate G line position - exactly 60% up from bottom
        const targetY = Math.round(analysis.glassBottom - (analysis.glassBottom - analysis.glassTop) * 0.6);
        
        // Draw target line and G marker
        drawTargetLine(targetY);
        
        // Calculate score based on how close liquid level is to G line
        const score = calculateScore(analysis.liquidLevel, targetY);
        
        // Update percentages
        const beerPercentage = Math.round(analysis.beerLevel * 100);
        const emptyPercentage = 100 - beerPercentage;
        
        // Draw the percentage brackets and text
        drawPercentageOverlay(beerPercentage, emptyPercentage);
        
        // Finally update the score display
        displayResults(score, targetY);
        
        // Hide capture button after first photo
        captureBtn.style.display = 'none';
        
    } catch (err) {
        console.error('Error processing image:', err);
        alert('Error processing image. Please try again with better lighting and glass positioning.');
        // Reset to camera view
        canvas.style.display = 'none';
        video.style.display = 'block';
        captureBtn.style.display = 'block';
    }
}

// Function to draw debug visualization
function drawDebugVisualization(debugData, glassTop, glassBottom, liquidLevel, leftRimTop, rightRimTop) {
    // Draw single rim line at the highest point
    const highestRimPoint = Math.min(leftRimTop, rightRimTop);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 255, 255, 1)'; // Full opacity cyan
    ctx.lineWidth = 2;
    
    // Single rim line at highest point
    ctx.moveTo(Math.floor(canvas.width * analysisRegions.left), highestRimPoint);
    ctx.lineTo(Math.floor(canvas.width * analysisRegions.right), highestRimPoint);
    ctx.stroke();
    
    // Bottom line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 255, 255, 1)';
    ctx.moveTo(Math.floor(canvas.width * analysisRegions.left), glassBottom);
    ctx.lineTo(Math.floor(canvas.width * analysisRegions.right), glassBottom);
    ctx.stroke();
    
    // Draw liquid level line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.moveTo(Math.floor(canvas.width * analysisRegions.left), liquidLevel);
    ctx.lineTo(Math.floor(canvas.width * analysisRegions.right), liquidLevel);
    ctx.stroke();
    
    // Draw detection points
    const pointWidth = 3;
    for (let y = 0; y < canvas.height; y++) {
        const intensity = debugData[y];
        if (intensity > 0.1) {
            ctx.fillStyle = `rgba(255, 0, 0, ${intensity})`;
            ctx.fillRect(canvas.width - 25, y - pointWidth/2, 20, pointWidth);
        }
    }
}

// Function to draw brackets and percentages on the image
function drawPercentageOverlay(beerPercentage, emptyPercentage) {
    // Add semi-transparent background for better text visibility
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    
    // Get the current glass boundaries from the last analysis
    const { glassTop, glassBottom, liquidLevel } = window.lastAnalysis || {};
    if (!glassTop || !glassBottom || !liquidLevel) return;
    
    // Empty space bracket and percentage (from glass top to liquid)
    ctx.beginPath();
    ctx.strokeStyle = '#e74c3c'; // Red
    ctx.lineWidth = 3;
    // Left bracket for empty space
    ctx.moveTo(10, glassTop);
    ctx.lineTo(30, glassTop);
    ctx.lineTo(30, liquidLevel);
    ctx.lineTo(10, liquidLevel);
    ctx.stroke();
    
    // Calculate new percentages based on actual glass boundaries
    const totalHeight = glassBottom - glassTop;
    const emptyHeight = liquidLevel - glassTop;
    const beerHeight = glassBottom - liquidLevel;
    const newEmptyPercentage = Math.round((emptyHeight / totalHeight) * 100);
    const newBeerPercentage = Math.round((beerHeight / totalHeight) * 100);
    
    // Background for empty percentage
    const emptyText = `${newEmptyPercentage}%`;
    ctx.font = 'bold 24px Arial';
    const emptyMetrics = ctx.measureText(emptyText);
    const emptyY = glassTop + (liquidLevel - glassTop) / 2;
    ctx.fillRect(35, emptyY - 20, emptyMetrics.width + 10, 30);
    
    // Empty percentage text
    ctx.fillStyle = '#e74c3c';
    ctx.fillText(emptyText, 40, emptyY);
    
    // Beer space bracket and percentage
    ctx.beginPath();
    ctx.strokeStyle = '#2ecc71'; // Green
    // Left bracket for beer
    ctx.moveTo(10, liquidLevel);
    ctx.lineTo(30, liquidLevel);
    ctx.lineTo(30, glassBottom);
    ctx.lineTo(10, glassBottom);
    ctx.stroke();
    
    // Background for beer percentage
    const beerText = `${newBeerPercentage}%`;
    const beerY = liquidLevel + (glassBottom - liquidLevel) / 2;
    const beerMetrics = ctx.measureText(beerText);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(35, beerY - 20, beerMetrics.width + 10, 30);
    
    // Beer percentage text
    ctx.fillStyle = '#2ecc71';
    ctx.fillText(beerText, 40, beerY);
}

// Draw target line and G marker
function drawTargetLine(targetY) {
    // Draw line with slightly increased opacity
    ctx.beginPath();
    ctx.moveTo(Math.floor(canvas.width * analysisRegions.left), targetY);
    ctx.lineTo(Math.floor(canvas.width * analysisRegions.right), targetY);
    ctx.strokeStyle = 'rgba(224, 184, 119, 0.9)'; // #e0b877 with higher opacity
    ctx.lineWidth = 3; // Slightly thicker line
    ctx.stroke();
    
    // Draw G marker in the middle with enhanced visibility
    ctx.font = 'bold 32px Arial'; // Larger, bolder font
    ctx.fillStyle = '#e0b877';
    // Add subtle shadow for better contrast
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    // Calculate center position
    const centerX = Math.floor(canvas.width * (analysisRegions.left + analysisRegions.right) / 2);
    ctx.textAlign = 'center'; // Center the text
    ctx.fillText('G', centerX, targetY - 8);
    
    // Reset shadow and text alignment
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.textAlign = 'start';
}

// Analyze the beer level in the image
function analyzeBeerLevel(imageData, width, height) {
    const debugData = new Array(height).fill(0);
    let edgeIntensityByRow = new Array(height).fill(0);
    let leftEdgeIntensity = new Array(height).fill(0);
    let rightEdgeIntensity = new Array(height).fill(0);
    let liquidTransitionByRow = new Array(height).fill(0);
    
    // Sample the middle third of the guide area for liquid detection
    const guideWidth = (analysisRegions.right - analysisRegions.left) * width;
    const startX = Math.floor(width * analysisRegions.left + guideWidth * 0.33);
    const endX = Math.floor(width * analysisRegions.left + guideWidth * 0.66);
    const sampleWidth = endX - startX;
    
    // Define regions for left and right rim detection
    const leftRegionStart = Math.floor(width * analysisRegions.left);
    const leftRegionEnd = Math.floor(width * (analysisRegions.left + 0.1));
    const rightRegionStart = Math.floor(width * (analysisRegions.right - 0.1));
    const rightRegionEnd = Math.floor(width * analysisRegions.right);
    
    // Analysis boundaries
    const startY = Math.floor(height * analysisRegions.top);
    const endY = Math.floor(height * analysisRegions.bottom);
    
    // First pass: detect edges and potential liquid boundaries
    for (let y = startY + 1; y < endY - 1; y++) {
        // Scan left region for left rim
        for (let x = leftRegionStart; x < leftRegionEnd; x++) {
            const idx = (y * width + x) * 4;
            const idxAbove = ((y - 1) * width + x) * 4;
            const idxBelow = ((y + 1) * width + x) * 4;
            
            // Calculate brightness values
            const brightness = (imageData[idx] + imageData[idx + 1] + imageData[idx + 2]) / 3;
            const brightnessAbove = (imageData[idxAbove] + imageData[idxAbove + 1] + imageData[idxAbove + 2]) / 3;
            const brightnessBelow = (imageData[idxBelow] + imageData[idxBelow + 1] + imageData[idxBelow + 2]) / 3;
            
            const verticalEdge = Math.abs(brightness - brightnessAbove) + Math.abs(brightness - brightnessBelow);
            const brightnessDiff = Math.abs(brightness - ((brightnessAbove + brightnessBelow) / 2));
            
            leftEdgeIntensity[y] += (verticalEdge > 30 || brightnessDiff > 20) ? 1 : 0;
        }
        
        // Scan right region for right rim
        for (let x = rightRegionStart; x < rightRegionEnd; x++) {
            const idx = (y * width + x) * 4;
            const idxAbove = ((y - 1) * width + x) * 4;
            const idxBelow = ((y + 1) * width + x) * 4;
            
            const brightness = (imageData[idx] + imageData[idx + 1] + imageData[idx + 2]) / 3;
            const brightnessAbove = (imageData[idxAbove] + imageData[idxAbove + 1] + imageData[idxAbove + 2]) / 3;
            const brightnessBelow = (imageData[idxBelow] + imageData[idxBelow + 1] + imageData[idxBelow + 2]) / 3;
            
            const verticalEdge = Math.abs(brightness - brightnessAbove) + Math.abs(brightness - brightnessBelow);
            const brightnessDiff = Math.abs(brightness - ((brightnessAbove + brightnessBelow) / 2));
            
            rightEdgeIntensity[y] += (verticalEdge > 30 || brightnessDiff > 20) ? 1 : 0;
        }
        
        // Scan middle region for liquid level
        for (let x = startX; x < endX; x++) {
            const idx = (y * width + x) * 4;
            const idxAbove = ((y - 1) * width + x) * 4;
            const idxBelow = ((y + 1) * width + x) * 4;
            
            const brightness = (imageData[idx] + imageData[idx + 1] + imageData[idx + 2]) / 3;
            const brightnessAbove = (imageData[idxAbove] + imageData[idxAbove + 1] + imageData[idxAbove + 2]) / 3;
            const brightnessBelow = (imageData[idxBelow] + imageData[idxBelow + 1] + imageData[idxBelow + 2]) / 3;
            
            // For overall edge detection (used for bottom)
            const verticalEdge = Math.abs(brightness - brightnessAbove) + Math.abs(brightness - brightnessBelow);
            const brightnessDiff = Math.abs(brightness - ((brightnessAbove + brightnessBelow) / 2));
            edgeIntensityByRow[y] += (verticalEdge > 30 || brightnessDiff > 20) ? 1 : 0;
            
            // For liquid level detection
            const colorDiff = Math.abs(brightnessAbove - brightnessBelow);
            liquidTransitionByRow[y] += colorDiff > 20 ? 1 : 0;
        }
        
        // Normalize values
        leftEdgeIntensity[y] /= (leftRegionEnd - leftRegionStart);
        rightEdgeIntensity[y] /= (rightRegionEnd - rightRegionStart);
        edgeIntensityByRow[y] /= sampleWidth;
        liquidTransitionByRow[y] /= sampleWidth;
        debugData[y] = liquidTransitionByRow[y];
    }
    
    // Find left and right rim positions
    let leftRimTop = height * analysisRegions.top;
    let rightRimTop = height * analysisRegions.top;
    let leftTopEdges = [];
    let rightTopEdges = [];
    
    // Detect significant edges in the top portion of the guide area
    const minEdgeStrength = 0.15;
    const topSearchLimit = height * (analysisRegions.top + (analysisRegions.bottom - analysisRegions.top) * 0.3);
    for (let y = Math.floor(height * analysisRegions.top); y < topSearchLimit; y++) {
        if (leftEdgeIntensity[y] > minEdgeStrength) {
            leftTopEdges.push({
                position: y,
                strength: leftEdgeIntensity[y]
            });
        }
        if (rightEdgeIntensity[y] > minEdgeStrength) {
            rightTopEdges.push({
                position: y,
                strength: rightEdgeIntensity[y]
            });
        }
    }
    
    // Sort edges by strength for both sides
    leftTopEdges.sort((a, b) => b.strength - a.strength);
    rightTopEdges.sort((a, b) => b.strength - a.strength);
    
    // Find the highest strong edge for each side (this will be the back rim)
    if (leftTopEdges.length > 0) {
        const strongLeftEdges = leftTopEdges.slice(0, 3);
        leftRimTop = Math.min(...strongLeftEdges.map(edge => edge.position));
    }
    
    if (rightTopEdges.length > 0) {
        const strongRightEdges = rightTopEdges.slice(0, 3);
        rightRimTop = Math.min(...strongRightEdges.map(edge => edge.position));
    }
    
    // Use only the highest rim position
    const glassTop = Math.min(leftRimTop, rightRimTop);
    
    // Find glass bottom (keeping existing logic as it works well)
    let glassBottom = height * 0.75;
    let maxEdgeStrength = 0;
    
    for (let y = Math.floor(height * 0.6); y < Math.floor(height * 0.9); y++) {
        if (edgeIntensityByRow[y] > maxEdgeStrength) {
            maxEdgeStrength = edgeIntensityByRow[y];
            glassBottom = y;
        }
    }
    
    // Find liquid level within the glass boundaries
    let liquidLevel = glassBottom;
    let maxTransition = 0;
    const windowSize = 5;
    const minColorDiff = 30; // Minimum color difference to consider as a transition
    
    // Start from the bottom and move up
    for (let y = glassBottom - windowSize; y > glassTop + windowSize; y--) {
        const currentWindow = [];
        const aboveWindow = [];
        
        // Sample colors in the current window and window above
        for (let x = startX; x < endX; x++) {
            for (let wy = 0; wy < windowSize; wy++) {
                const currentIdx = ((y + wy) * width + x) * 4;
                const aboveIdx = ((y - windowSize + wy) * width + x) * 4;
                
                // Get RGB values
                const currentR = imageData[currentIdx];
                const currentG = imageData[currentIdx + 1];
                const currentB = imageData[currentIdx + 2];
                const aboveR = imageData[aboveIdx];
                const aboveG = imageData[aboveIdx + 1];
                const aboveB = imageData[aboveIdx + 2];
                
                // Calculate color values
                currentWindow.push({
                    brightness: (currentR + currentG + currentB) / 3,
                    r: currentR,
                    g: currentG,
                    b: currentB
                });
                
                aboveWindow.push({
                    brightness: (aboveR + aboveG + aboveB) / 3,
                    r: aboveR,
                    g: aboveG,
                    b: aboveB
                });
            }
        }
        
        // Calculate average colors for both windows
        const currentAvg = currentWindow.reduce((acc, val) => ({
            brightness: acc.brightness + val.brightness,
            r: acc.r + val.r,
            g: acc.g + val.g,
            b: acc.b + val.b
        }), { brightness: 0, r: 0, g: 0, b: 0 });
        
        const aboveAvg = aboveWindow.reduce((acc, val) => ({
            brightness: acc.brightness + val.brightness,
            r: acc.r + val.r,
            g: acc.g + val.g,
            b: acc.b + val.b
        }), { brightness: 0, r: 0, g: 0, b: 0 });
        
        const n = currentWindow.length;
        currentAvg.brightness /= n;
        currentAvg.r /= n;
        currentAvg.g /= n;
        currentAvg.b /= n;
        aboveAvg.brightness /= n;
        aboveAvg.r /= n;
        aboveAvg.g /= n;
        aboveAvg.b /= n;
        
        // Calculate color difference
        const colorDiff = Math.abs(currentAvg.brightness - aboveAvg.brightness) +
                         Math.abs(currentAvg.r - aboveAvg.r) +
                         Math.abs(currentAvg.g - aboveAvg.g) +
                         Math.abs(currentAvg.b - aboveAvg.b);
        
        // Store for visualization
        debugData[y] = colorDiff / 1000;
        
        // If we find a significant color transition
        if (colorDiff > minColorDiff && colorDiff > maxTransition) {
            maxTransition = colorDiff;
            liquidLevel = y;
        }
    }
    
    // Calculate beer level as percentage from bottom
    const glassHeight = glassBottom - glassTop;
    const beerHeight = glassBottom - liquidLevel;
    const beerLevel = beerHeight / glassHeight;
    
    return {
        beerLevel: beerLevel,
        debugData: debugData,
        glassTop: glassTop, // Use highest rim as glass top
        glassBottom: glassBottom,
        liquidLevel: liquidLevel,
        leftRimTop: leftRimTop,
        rightRimTop: rightRimTop
    };
}

// Calculate score based on how close the liquid level is to target line
function calculateScore(liquidLevel, targetY) {
    // Calculate the pixel difference between liquid level and G line
    const pixelDifference = Math.abs(liquidLevel - targetY);
    
    // Maximum allowed difference (in pixels) for scoring
    // Smaller value = more strict scoring
    const maxAllowedDifference = 10; // Very strict scoring
    
    // Calculate score as percentage of accuracy
    // The closer to the G line, the higher the score
    const score = Math.max(0, 100 - ((pixelDifference / maxAllowedDifference) * 100));
    
    // For debugging
    console.log('Bottom of glass:', window.lastAnalysis.glassBottom);
    console.log('G line (60% up):', targetY);
    console.log('Liquid Level:', liquidLevel);
    console.log('Pixel Difference:', pixelDifference);
    console.log('Score:', score);
    
    // Round to nearest integer
    return Math.round(score);
}

// Display results to user
function displayResults(score, targetY) {
    scoreSpan.textContent = score.toFixed(2);
    
    let feedback;
    if (score >= 95) {
        feedback = "Perfect G split! You're a Guinness master! 🏆";
    } else if (score >= 85) {
        feedback = "Almost there! A little " + (window.lastAnalysis.liquidLevel < targetY ? "higher" : "lower") + "! 🎯";
    } else if (score >= 70) {
        feedback = "Getting closer! Move the liquid " + (window.lastAnalysis.liquidLevel < targetY ? "up" : "down") + "! 🎯";
    } else if (score >= 50) {
        feedback = "Keep adjusting! Need to go " + (window.lastAnalysis.liquidLevel < targetY ? "higher" : "lower") + "! 🎯";
    } else {
        feedback = "Try again! The liquid level needs to be much " + (window.lastAnalysis.liquidLevel < targetY ? "higher" : "lower") + "! 🎯";
    }
    
    feedbackP.textContent = feedback;
    resultDiv.style.display = 'block';
}

// Try again button handler
tryAgainBtn.addEventListener('click', () => {
    resultDiv.style.display = 'none';
    // Reset to camera view
    canvas.style.display = 'none';
    video.style.display = 'block';
    captureBtn.style.display = 'block';
});

// Initialize
initCamera();
