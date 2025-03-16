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
        const { beerLevel, debugData, glassTop, glassBottom, liquidLevel } = analyzeBeerLevel(data, canvas.width, canvas.height);
        
        // Calculate score based on how close to 3/4 the level is
        const targetLevel = 0.75; // 3/4 of the glass
        const score = calculateScore(beerLevel, targetLevel);
        
        // Update percentages
        const beerPercentage = Math.round(beerLevel * 100);
        const emptyPercentage = 100 - beerPercentage;
        
        // Draw debug visualization with glass boundaries
        drawDebugVisualization(debugData, glassTop, glassBottom, liquidLevel);
        
        // Draw target line and G marker first
        drawTargetLine();
        
        // Then draw the percentage brackets and text
        drawPercentageOverlay(beerPercentage, emptyPercentage);
        
        // Finally update the score display
        displayResults(score);
        
    } catch (err) {
        console.error('Error processing image:', err);
        alert('Error processing image. Please try again.');
    }
}

// Function to draw debug visualization
function drawDebugVisualization(debugData, glassTop, glassBottom, liquidLevel) {
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
    
    // Draw glass top and bottom lines
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    
    // Top line
    ctx.moveTo(startX - 20, glassTop);
    ctx.lineTo(endX + 20, glassTop);
    
    // Bottom line
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
    const targetY = canvas.height * 0.25; // 3/4 line position
    
    // Add semi-transparent background for better text visibility
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    
    // Empty space bracket and percentage
    ctx.beginPath();
    ctx.strokeStyle = '#e74c3c'; // Red
    ctx.lineWidth = 3;
    // Left bracket
    ctx.moveTo(10, 10);
    ctx.lineTo(30, 10);
    ctx.lineTo(30, targetY);
    ctx.lineTo(10, targetY);
    ctx.stroke();
    
    // Background for empty percentage
    const emptyText = `${emptyPercentage}%`;
    ctx.font = 'bold 24px Arial';
    const emptyMetrics = ctx.measureText(emptyText);
    const emptyY = targetY / 2;
    ctx.fillRect(35, emptyY - 20, emptyMetrics.width + 10, 30);
    
    // Empty percentage text
    ctx.fillStyle = '#e74c3c';
    ctx.fillText(emptyText, 40, emptyY);
    
    // Beer space bracket and percentage
    ctx.beginPath();
    ctx.strokeStyle = '#2ecc71'; // Green
    // Left bracket
    ctx.moveTo(10, targetY);
    ctx.lineTo(30, targetY);
    ctx.lineTo(30, canvas.height - 10);
    ctx.lineTo(10, canvas.height - 10);
    ctx.stroke();
    
    // Background for beer percentage
    const beerText = `${beerPercentage}%`;
    const beerY = targetY + (canvas.height - targetY) / 2;
    const beerMetrics = ctx.measureText(beerText);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(35, beerY - 20, beerMetrics.width + 10, 30);
    
    // Beer percentage text
    ctx.fillStyle = '#2ecc71';
    ctx.fillText(beerText, 40, beerY);
}

// Draw target line and G marker
function drawTargetLine() {
    const targetY = canvas.height * 0.25; // 3/4 from the bottom
    
    // Draw line
    ctx.beginPath();
    ctx.moveTo(0, targetY);
    ctx.lineTo(canvas.width - 50, targetY);
    ctx.strokeStyle = '#e0b877';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw G marker
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#e0b877';
    ctx.fillText('G', canvas.width - 40, targetY - 5);
}

// Analyze the beer level in the image
function analyzeBeerLevel(imageData, width, height) {
    const debugData = new Array(height).fill(0);
    let edgeIntensityByRow = new Array(height).fill(0);
    let liquidTransitionByRow = new Array(height).fill(0);
    
    // Sample the middle third of the image width
    const startX = Math.floor(width * 0.33);
    const endX = Math.floor(width * 0.66);
    const sampleWidth = endX - startX;
    
    // First pass: detect edges and potential liquid boundaries
    for (let y = 1; y < height - 1; y++) {
        for (let x = startX; x < endX; x++) {
            const idx = (y * width + x) * 4;
            const idxAbove = ((y - 1) * width + x) * 4;
            const idxBelow = ((y + 1) * width + x) * 4;
            
            // Get RGB values for current pixel and neighbors
            const r = imageData[idx];
            const g = imageData[idx + 1];
            const b = imageData[idx + 2];
            
            const rAbove = imageData[idxAbove];
            const gAbove = imageData[idxAbove + 1];
            const bAbove = imageData[idxAbove + 2];
            
            const rBelow = imageData[idxBelow];
            const gBelow = imageData[idxBelow + 1];
            const bBelow = imageData[idxBelow + 2];
            
            // Calculate brightness
            const brightness = (r + g + b) / 3;
            const brightnessAbove = (rAbove + gAbove + bAbove) / 3;
            const brightnessBelow = (rBelow + gBelow + bBelow) / 3;
            
            // Detect vertical edges (glass sides)
            const verticalEdge = Math.abs(brightness - brightnessAbove) + 
                               Math.abs(brightness - brightnessBelow);
            
            // Detect color/brightness transitions (liquid level)
            const colorDiff = Math.abs(brightnessAbove - brightnessBelow);
            
            edgeIntensityByRow[y] += verticalEdge > 30 ? 1 : 0;
            liquidTransitionByRow[y] += colorDiff > 20 ? 1 : 0;
        }
        
        // Normalize values
        edgeIntensityByRow[y] /= sampleWidth;
        liquidTransitionByRow[y] /= sampleWidth;
        debugData[y] = liquidTransitionByRow[y];
    }
    
    // Find glass top and bottom
    let glassTop = height * 0.25;
    let glassBottom = height * 0.75;
    let maxEdgeStrength = 0;
    
    // Look for strong horizontal edges in the top third
    for (let y = Math.floor(height * 0.1); y < Math.floor(height * 0.4); y++) {
        if (edgeIntensityByRow[y] > maxEdgeStrength) {
            maxEdgeStrength = edgeIntensityByRow[y];
            glassTop = y;
        }
    }
    
    // Look for strong horizontal edges in the bottom third
    maxEdgeStrength = 0;
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
    
    for (let y = glassTop + windowSize; y < glassBottom - windowSize; y++) {
        const above = liquidTransitionByRow.slice(y - windowSize, y).reduce((a, b) => a + b) / windowSize;
        const below = liquidTransitionByRow.slice(y, y + windowSize).reduce((a, b) => a + b) / windowSize;
        const transition = Math.abs(above - below);
        
        if (transition > maxTransition) {
            maxTransition = transition;
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
        glassTop: glassTop,
        glassBottom: glassBottom,
        liquidLevel: liquidLevel
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
});

// Initialize
initCamera();
