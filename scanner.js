const video = document.getElementById('video');
const mainCanvas = document.getElementById('mainCanvas');
const mainContext = mainCanvas.getContext('2d', { willReadFrequently: true });
const processedCanvas = document.getElementById('processedCanvas');
const processedContext = processedCanvas.getContext('2d');
const codeDisplay = document.getElementById('code');
const logDisplay = document.getElementById('log');
const scanButton = document.getElementById('scanButton');
const copyButton = document.getElementById('copyButton');

let isScanning = false;
let shouldStopScanning = false;
let capturedImageData = null;

function log(message) {
    console.log(message);
    const logEntry = document.createElement('div');
    logEntry.textContent = message;
    logDisplay.appendChild(logEntry);
    logDisplay.scrollTop = logDisplay.scrollHeight;
}

function getCameraStream() {
    const constraints = {
        video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: { ideal: 'environment' }
        }
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            video.srcObject = stream;
            video.play();
            log('Camera accessed successfully.');
        })
        .catch(err => {
            log(`Error accessing camera: ${err}`);
            console.error("Error accessing camera: ", err);
        });
}

getCameraStream();

const orderCodePattern = /(?:SGRO|sgro|RO|ro)\d{10}/;

function displayMat(mat, canvas) {
    cv.imshow(canvas, mat);
}

function playBeep(type) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';

    switch(type) {
        case 'start':
            // Single beep for scan start
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.1);
            break;
        case 'success':
            // Pleasant double beep for success
            oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.1);

            setTimeout(() => {
                oscillator.frequency.setValueAtTime(1200, audioContext.currentTime);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.1);
            }, 150);
            break;
        case 'failure':
            // Short buzz for failure
            oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.2);
            break;
    }
}

async function processFrame() {
    if (isScanning) return;
    isScanning = true;
    shouldStopScanning = false;

    log('Processing frame...');

    // Capture the current frame
    mainCanvas.width = video.videoWidth;
    mainCanvas.height = video.videoHeight;
    mainContext.drawImage(video, 0, 0, mainCanvas.width, mainCanvas.height);
    capturedImageData = mainContext.getImageData(0, 0, mainCanvas.width, mainCanvas.height);

    let src = cv.matFromImageData(capturedImageData);
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Enhance contrast
    let clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    clahe.apply(gray, gray);

    // Apply Gaussian blur to reduce noise
    cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);

    // Apply adaptive thresholding
    cv.adaptiveThreshold(gray, gray, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

    displayMat(gray, processedCanvas);

    try {
        let result = await Tesseract.recognize(processedCanvas, 'eng', {
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
            tessedit_pageseg_mode: '6'
        });

        let text = result.data.text.replace(/\s+/g, '');
        let match = text.match(orderCodePattern);
        if (match) {
            let orderCode = match[0].toUpperCase(); // Convert to uppercase for consistency
            codeDisplay.textContent = `DTH_ORDER_CODE: ${orderCode}`;
            codeDisplay.classList.add('code-found');
            log(`Order code found: ${orderCode}`);
            playBeep('success'); // Play success beep
        } else {
            log('No valid code found in this frame.');
            codeDisplay.textContent = 'DTH_ORDER_CODE: NOT_FOUND';
            codeDisplay.classList.remove('code-found');
            playBeep('failure'); // Play failure beep
        }
    } catch (err) {
        log(`Error during OCR: ${err}`);
        playBeep('failure'); // Play failure beep
    }

    src.delete();
    gray.delete();

    isScanning = false;
    log('Frame processing completed.');
    scanButton.textContent = 'Scan';
}

function resetScanState() {
    isScanning = false;
    shouldStopScanning = false;
    scanButton.textContent = 'Scan';
    codeDisplay.textContent = 'DTH_ORDER_CODE: WAITING_FOR_SCAN';
    codeDisplay.classList.remove('code-found');
    logDisplay.innerHTML = '';
    log('Ready for new scan.');
}

scanButton.addEventListener('click', () => {
    if (isScanning) {
        shouldStopScanning = true;
        log('Scanning interrupted by user.');
        setTimeout(resetScanState, 100);
    } else {
        codeDisplay.textContent = 'DTH_ORDER_CODE: SCAN_IN_PROGRESS';
        codeDisplay.classList.remove('code-found');
        logDisplay.innerHTML = '';
        scanButton.textContent = 'Stop Scan';
        playBeep('start'); // Play start beep
        processFrame();
    }
});

video.addEventListener('loadedmetadata', () => {
    log('Video metadata loaded.');
    mainCanvas.width = video.videoWidth;
    mainCanvas.height = video.videoHeight;
    processedCanvas.width = video.videoWidth;
    processedCanvas.height = video.videoHeight;
});

video.addEventListener('play', () => {
    log('Video stream started.');
});

function updateMainCanvas() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        mainContext.drawImage(video, 0, 0, mainCanvas.width, mainCanvas.height);
    }
    requestAnimationFrame(updateMainCanvas);
}

video.addEventListener('play', updateMainCanvas);

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        copyButton.textContent = 'COPIAT';
        copyButton.classList.add('success');
        setTimeout(() => {
            copyButton.textContent = 'COPIEAZA';
            copyButton.classList.remove('success');
        }, 1000);
    }).catch(err => {
        log(`Failed to copy text: ${err}`);
    });
}

copyButton.addEventListener('click', () => {
    const codeText = codeDisplay.textContent.replace('DTH_ORDER_CODE: ', '');
    if (codeText && codeText !== 'WAITING_FOR_SCAN' && codeText !== 'SCAN_IN_PROGRESS' && codeText !== 'NOT_FOUND') {
        copyToClipboard(codeText);
    }
});

// Initial reset to ensure the system is ready for the first scan
resetScanState();