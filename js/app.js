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
        
        // Enable capture button once video is ready
        captureBtn.disabled = false;
        
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

// Capture photo
captureBtn.addEventListener('click', () => {
    // Hide video and show canvas
    video.style.display = 'none';
    canvas.style.display = 'block';
    
    // Draw the image at full resolution
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    processImage();
});

// Process image and calculate score
async function processImage() {
    try {
        // Get image data for analysis
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Find the beer level using color analysis
        const analysis = analyzeBeerLevel(data, canvas.width, canvas.height);
        window.lastAnalysis = analysis; // Store for use in drawPercentageOverlay
        
        // Calculate score based on how close to 3/4 the level is
        const targetLevel = 0.75; // 3/4 of the glass
        const score = calculateScore(analysis.beerLevel, targetLevel);
        
        // Update percentages
        const beerPercentage = Math.round(analysis.beerLevel * 100);
        const emptyPercentage = 100 - beerPercentage;
        
        // Draw debug visualization with glass boundaries
        drawDebugVisualization(
            analysis.debugData,
            analysis.glassTop,
            analysis.glassBottom,
            analysis.liquidLevel,
            analysis.leftRimTop,
            analysis.rightRimTop
        );
        
        // Draw target line and G marker first
        drawTargetLine();
        
        // Then draw the percentage brackets and text
        drawPercentageOverlay(beerPercentage, emptyPercentage);
        
        // Finally update the score display
        displayResults(score);
        
        // Hide capture button after first photo
        captureBtn.style.display = 'none';
        
    } catch (err) {
        console.error('Error processing image:', err);
        alert('Error processing image. Please try again.');
    }
}

// Function to draw debug visualization
function drawDebugVisualization(debugData, glassTop, glassBottom, liquidLevel, leftRimTop, rightRimTop) {
    // Draw the sampling area
    const startX = Math.floor(canvas.width * 0.33);
    const endX = Math.floor(canvas.width * 0.66);
    
    // Draw vertical lines showing sampling area
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
    ctx.lineWidth = 2;
    
    // Left boundary
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, canvas.height);
    
    // Right boundary
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, canvas.height);
    ctx.stroke();
    
    // Draw both rim positions with full opacity
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 255, 255, 1)'; // Full opacity cyan
    ctx.lineWidth = 2;
    
    // Front rim (lower)
    ctx.moveTo(Math.floor(canvas.width * 0.2), Math.max(leftRimTop, rightRimTop));
    ctx.lineTo(Math.floor(canvas.width * 0.8), Math.max(leftRimTop, rightRimTop));
    
    // Back rim (higher)
    ctx.moveTo(Math.floor(canvas.width * 0.2), Math.min(leftRimTop, rightRimTop));
    ctx.lineTo(Math.floor(canvas.width * 0.8), Math.min(leftRimTop, rightRimTop));
    ctx.stroke();
    
    // Bottom line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 255, 255, 1)';
    ctx.moveTo(startX - 20, glassBottom);
    ctx.lineTo(endX + 20, glassBottom);
    ctx.stroke();
    
    // Draw liquid level line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.moveTo(startX - 20, liquidLevel);
    ctx.lineTo(endX + 20, liquidLevel);
    ctx.stroke();
    
    // Draw detection points
    const pointWidth = 3;
    for (let y = 0; y < canvas.height; y++) {
        const intensity = debugData[y];
        if (intensity > 0.1) {
            ctx.fillStyle = `rgba(255, 0, 0, ${intensity})`;
            ctx.fillRect(endX + 5, y - pointWidth/2, 20, pointWidth);
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
function drawTargetLine() {
    // Get the glass boundaries from the last analysis
    const { glassTop, glassBottom } = window.lastAnalysis || {};
    if (!glassTop || !glassBottom) return;
    
    // Calculate target Y position (60% up from bottom between glass edges)
    const glassHeight = glassBottom - glassTop;
    const targetY = glassBottom - (glassHeight * 0.60);
    
    // Draw line with slightly increased opacity
    ctx.beginPath();
    ctx.moveTo(0, targetY);
    ctx.lineTo(canvas.width - 60, targetY);
    ctx.strokeStyle = 'rgba(224, 184, 119, 0.9)'; // #e0b877 with higher opacity
    ctx.lineWidth = 3; // Slightly thicker line
    ctx.stroke();
    
    // Draw G marker with enhanced visibility
    ctx.font = 'bold 32px Arial'; // Larger, bolder font
    ctx.fillStyle = '#e0b877';
    // Add subtle shadow for better contrast
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText('G', canvas.width - 50, targetY - 8);
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

// Analyze the beer level in the image
function analyzeBeerLevel(imageData, width, height) {
    const debugData = new Array(height).fill(0);
    let edgeIntensityByRow = new Array(height).fill(0);
    let leftEdgeIntensity = new Array(height).fill(0);
    let rightEdgeIntensity = new Array(height).fill(0);
    let liquidTransitionByRow = new Array(height).fill(0);
    
    // Sample the middle third of the image width for liquid detection
    const startX = Math.floor(width * 0.33);
    const endX = Math.floor(width * 0.66);
    const sampleWidth = endX - startX;
    
    // Define regions for left and right rim detection
    const leftRegionStart = Math.floor(width * 0.2);
    const leftRegionEnd = Math.floor(width * 0.4);
    const rightRegionStart = Math.floor(width * 0.6);
    const rightRegionEnd = Math.floor(width * 0.8);
    
    // First pass: detect edges and potential liquid boundaries
    for (let y = 1; y < height - 1; y++) {
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
    let leftRimTop = height * 0.25;
    let rightRimTop = height * 0.25;
    let leftTopEdges = [];
    let rightTopEdges = [];
    
    // Detect significant edges in the top half for both sides
    const minEdgeStrength = 0.15;
    for (let y = Math.floor(height * 0.05); y < Math.floor(height * 0.5); y++) {
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
    
    // Use the higher of the two rim positions as the back rim
    const backRim = Math.min(leftRimTop, rightRimTop);
    
    // Now look for the front rim by scanning downward from the back rim
    let leftFrontRim = backRim;
    let rightFrontRim = backRim;
    const maxRimDistance = height * 0.15; // Maximum expected distance between front and back rim
    
    // Scan for front rim (look for bright reflective edges)
    for (let y = backRim + 5; y < backRim + maxRimDistance; y++) {
        // Check left side
        let leftBrightness = 0;
        let leftEdgeStrength = 0;
        for (let x = leftRegionStart; x < leftRegionEnd; x++) {
            const idx = (y * width + x) * 4;
            // Calculate brightness and look for bright spots (reflections)
            const pixelBrightness = (imageData[idx] + imageData[idx + 1] + imageData[idx + 2]) / 3;
            leftBrightness += pixelBrightness;
            // Also check for edge strength
            if (y < height - 1) {
                const idxBelow = ((y + 1) * width + x) * 4;
                const belowBrightness = (imageData[idxBelow] + imageData[idxBelow + 1] + imageData[idxBelow + 2]) / 3;
                leftEdgeStrength += Math.abs(pixelBrightness - belowBrightness);
            }
        }
        leftBrightness /= (leftRegionEnd - leftRegionStart);
        leftEdgeStrength /= (leftRegionEnd - leftRegionStart);
        
        // Check right side
        let rightBrightness = 0;
        let rightEdgeStrength = 0;
        for (let x = rightRegionStart; x < rightRegionEnd; x++) {
            const idx = (y * width + x) * 4;
            const pixelBrightness = (imageData[idx] + imageData[idx + 1] + imageData[idx + 2]) / 3;
            rightBrightness += pixelBrightness;
            if (y < height - 1) {
                const idxBelow = ((y + 1) * width + x) * 4;
                const belowBrightness = (imageData[idxBelow] + imageData[idxBelow + 1] + imageData[idxBelow + 2]) / 3;
                rightEdgeStrength += Math.abs(pixelBrightness - belowBrightness);
            }
        }
        rightBrightness /= (rightRegionEnd - rightRegionStart);
        rightEdgeStrength /= (rightRegionEnd - rightRegionStart);
        
        // Update front rim positions if we find a strong edge with high brightness
        const brightnessThreshold = 150;
        const edgeThreshold = 20;
        
        if (leftBrightness > brightnessThreshold && leftEdgeStrength > edgeThreshold) {
            leftFrontRim = y;
        }
        if (rightBrightness > brightnessThreshold && rightEdgeStrength > edgeThreshold) {
            rightFrontRim = y;
        }
    }
    
    // Use the lower of the two front rim positions as the glass top
    const glassTop = Math.max(leftFrontRim, rightFrontRim);
    
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
    const glassHeight = glassBottom - Math.max(leftRimTop, rightRimTop);
    const beerHeight = glassBottom - liquidLevel;
    const beerLevel = beerHeight / glassHeight;
    
    return {
        beerLevel: beerLevel,
        debugData: debugData,
        glassTop: Math.max(leftRimTop, rightRimTop), // Use lower rim as glass top
        glassBottom: glassBottom,
        liquidLevel: liquidLevel,
        leftRimTop: leftRimTop,
        rightRimTop: rightRimTop
    };
}

// Calculate score based on how close the level is to target
function calculateScore(actualLevel, targetLevel) {
    const difference = Math.abs(actualLevel - targetLevel);
    // Convert to a 0-100 score, with 100 being perfect
    const score = Math.max(0, 100 - (difference * 200));
    return Math.round(score * 100) / 100;
}

// Display results to user
function displayResults(score) {
    scoreSpan.textContent = score.toFixed(2);
    
    let feedback;
    if (score > 95) {
        feedback = "Perfect split! You're a Guinness master! 🏆";
    } else if (score > 85) {
        feedback = "Very close! Almost perfect! 🎯";
    } else if (score > 70) {
        feedback = "Not bad, keep practicing! 🎯";
    } else {
        feedback = "Room for improvement - try again! 🎯";
    }
    
    feedbackP.textContent = feedback;
    resultDiv.style.display = 'block';
}

// Try again button handler
tryAgainBtn.addEventListener('click', () => {
    resultDiv.style.display = 'none';
    canvas.style.display = 'none';
    video.style.display = 'block';
    captureBtn.style.display = 'block'; // Show capture button again
});

// Initialize
initCamera();
