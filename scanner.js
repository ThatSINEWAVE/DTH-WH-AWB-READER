const video = document.getElementById('video');
const mainCanvas = document.getElementById('mainCanvas');
const mainContext = mainCanvas.getContext('2d');
const processedCanvas = document.getElementById('processedCanvas');
const processedContext = processedCanvas.getContext('2d');
const codeDisplay = document.getElementById('code');
const logDisplay = document.getElementById('log');
const scanButton = document.getElementById('scanButton');

let isScanning = false;
let shouldStopScanning = false;

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

const orderCodePattern = /SGRO\d{10}/;

function displayMat(mat, canvas) {
    cv.imshow(canvas, mat);
}

async function processFrame() {
    if (isScanning) return;
    isScanning = true;
    shouldStopScanning = false;

    log('Processing frame...');
    while (!shouldStopScanning) {
        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            await new Promise(resolve => setTimeout(resolve, 100));
            continue;
        }

        mainCanvas.width = video.videoWidth;
        mainCanvas.height = video.videoHeight;
        mainContext.drawImage(video, 0, 0, mainCanvas.width, mainCanvas.height);
        let frame = mainContext.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
        let src = cv.matFromImageData(frame);
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

        // Instead of finding contours, we'll use the entire processed image for OCR
        try {
            let result = await Tesseract.recognize(processedCanvas, 'eng', {
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                tessedit_pageseg_mode: '6'  // Assume a single uniform block of text
            });

            let text = result.data.text.replace(/\s+/g, '');
            let match = text.match(orderCodePattern);
            if (match) {
                let orderCode = match[0];
                codeDisplay.textContent = `DTH_ORDER_CODE: ${orderCode}`;
                codeDisplay.classList.add('code-found');
                log(`Order code found: ${orderCode}`);
                shouldStopScanning = true;
            }
        } catch (err) {
            log(`Error during OCR: ${err}`);
        }

        src.delete();
        gray.delete();

        if (shouldStopScanning) {
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    isScanning = false;
    log('Frame processing completed.');

    if (!shouldStopScanning) {
        log('No valid code found in this frame.');
        codeDisplay.textContent = 'DTH_ORDER_CODE: NOT_FOUND';
        codeDisplay.classList.remove('code-found');
    }

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

// Initial reset to ensure the system is ready for the first scan
resetScanState();