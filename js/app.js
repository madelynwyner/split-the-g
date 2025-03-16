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
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
    
    processImage();
});

// Process image and calculate score
async function processImage() {
    try {
        // Get image data for analysis
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Find the beer level using color analysis
        const { beerLevel, debugData } = analyzeBeerLevel(data, canvas.width, canvas.height);
        
        // Draw target line and G marker
        drawTargetLine();
        
        // Calculate score based on how close to 3/4 the level is
        const targetLevel = 0.75; // 3/4 of the glass
        const score = calculateScore(beerLevel, targetLevel);
        
        // Update percentages
        const beerPercentage = Math.round(beerLevel * 100);
        const emptyPercentage = 100 - beerPercentage;
        
        displayResults(score, beerLevel, beerPercentage, emptyPercentage);
        
    } catch (err) {
        console.error('Error processing image:', err);
        alert('Error processing image. Please try again.');
    }
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

// Function to draw brackets and percentages on the image
function drawPercentageOverlay(beerPercentage, emptyPercentage) {
    const targetY = canvas.height * 0.25; // 3/4 line position
    
    // Draw empty space bracket and percentage
    ctx.beginPath();
    ctx.strokeStyle = '#e74c3c'; // Red
    ctx.lineWidth = 3;
    // Left bracket
    ctx.moveTo(10, 10);
    ctx.lineTo(30, 10);
    ctx.lineTo(30, targetY);
    ctx.lineTo(10, targetY);
    ctx.stroke();
    
    // Empty percentage text
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#e74c3c';
    ctx.fillText(`${emptyPercentage}%`, 40, targetY / 2);
    
    // Draw beer space bracket and percentage
    ctx.beginPath();
    ctx.strokeStyle = '#2ecc71'; // Green
    // Left bracket
    ctx.moveTo(10, targetY);
    ctx.lineTo(30, targetY);
    ctx.lineTo(30, canvas.height - 10);
    ctx.lineTo(10, canvas.height - 10);
    ctx.stroke();
    
    // Beer percentage text
    ctx.fillStyle = '#2ecc71';
    ctx.fillText(`${beerPercentage}%`, 40, targetY + (canvas.height - targetY) / 2);
}

// Analyze the beer level in the image
function analyzeBeerLevel(imageData, width, height) {
    const debugData = new Array(height).fill(0);
    let darkPixelsByRow = new Array(height).fill(0);
    
    // Sample the middle third of the image width
    const startX = Math.floor(width * 0.33);
    const endX = Math.floor(width * 0.66);
    const sampleWidth = endX - startX;
    
    // Count dark pixels in each row
    for (let y = 0; y < height; y++) {
        for (let x = startX; x < endX; x++) {
            const idx = (y * width + x) * 4;
            const r = imageData[idx];
            const g = imageData[idx + 1];
            const b = imageData[idx + 2];
            
            // Detect dark pixels (Guinness is very dark)
            if (r < 60 && g < 60 && b < 60) {
                darkPixelsByRow[y]++;
            }
        }
        // Convert to percentage
        darkPixelsByRow[y] = darkPixelsByRow[y] / sampleWidth;
        debugData[y] = darkPixelsByRow[y];
    }
    
    // Find the transition point (beer level)
    let maxTransition = 0;
    let transitionPoint = height * 0.75; // Default to 3/4 if no clear transition
    
    for (let y = 10; y < height - 10; y++) {
        const above = darkPixelsByRow.slice(y - 10, y).reduce((a, b) => a + b) / 10;
        const below = darkPixelsByRow.slice(y, y + 10).reduce((a, b) => a + b) / 10;
        const transition = Math.abs(above - below);
        
        if (transition > maxTransition) {
            maxTransition = transition;
            transitionPoint = y;
        }
    }
    
    return {
        beerLevel: 1 - (transitionPoint / height),
        debugData: debugData
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
function displayResults(score, level, beerPercentage, emptyPercentage) {
    scoreSpan.textContent = score.toFixed(2);
    
    // Draw the target line and G marker
    drawTargetLine();
    
    // Draw the percentage brackets and text
    drawPercentageOverlay(beerPercentage, emptyPercentage);
    
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
