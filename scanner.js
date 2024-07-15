const video = document.getElementById('video');
const mainCanvas = document.getElementById('mainCanvas');
const mainContext = mainCanvas.getContext('2d');
const processedCanvas = document.getElementById('processedCanvas');
const processedContext = processedCanvas.getContext('2d');
const contoursCanvas = document.getElementById('contoursCanvas');
const contoursContext = contoursCanvas.getContext('2d');
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

const orderCodePattern = /SGRO\d{13}_\d{6}/;

function displayMat(mat, canvas) {
    cv.imshow(canvas, mat);
}

async function processFrame() {
    if (isScanning) return;
    isScanning = true;
    shouldStopScanning = false;

    log('Processing frame...');
    while (!shouldStopScanning) {
        mainCanvas.width = video.videoWidth;
        mainCanvas.height = video.videoHeight;
        mainContext.drawImage(video, 0, 0, mainCanvas.width, mainCanvas.height);
        let frame = mainContext.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
        let src = cv.matFromImageData(frame);
        let gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
        cv.adaptiveThreshold(gray, gray, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

        let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        cv.morphologyEx(gray, gray, cv.MORPH_CLOSE, kernel);
        cv.morphologyEx(gray, gray, cv.MORPH_OPEN, kernel);

        displayMat(gray, processedCanvas);

        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(gray, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let contoursColor = new cv.Mat(src.rows, src.cols, cv.CV_8UC3, [0, 0, 0, 255]);
        for (let i = 0; i < contours.size(); i++) {
            let color = new cv.Scalar(Math.round(Math.random() * 255), Math.round(Math.random() * 255), Math.round(Math.random() * 255));
            cv.drawContours(contoursColor, contours, i, color, 1, cv.LINE_8, hierarchy, 100);
        }
        displayMat(contoursColor, contoursCanvas);

        let codeFound = false;

        let sortedContours = [];
        for (let i = 0; i < contours.size(); i++) {
            sortedContours.push({
                index: i,
                area: cv.contourArea(contours.get(i))
            });
        }
        sortedContours.sort((a, b) => b.area - a.area);

        for (let {index} of sortedContours.slice(0, 10)) {
            if (shouldStopScanning) break;

            let contour = contours.get(index);
            let rect = cv.boundingRect(contour);

            let aspectRatio = rect.width / rect.height;
            if (aspectRatio < 2 || aspectRatio > 15 || rect.width < 100) {
                continue;
            }

            let roi = gray.roi(rect);
            let roiCanvas = document.createElement('canvas');
            roiCanvas.width = rect.width;
            roiCanvas.height = rect.height;
            let roiContext = roiCanvas.getContext('2d');
            let roiImageData = new ImageData(new Uint8ClampedArray(roi.data), rect.width, rect.height);
            roiContext.putImageData(roiImageData, 0, 0);

            try {
                let result = await Tesseract.recognize(roiCanvas, 'eng', {
                    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_',
                    tessedit_pageseg_mode: '7'
                });
                let text = result.data.text.replace(/\s+/g, '');
                let match = text.match(orderCodePattern);
                if (match) {
                    let orderCode = match[0];
                    codeDisplay.textContent = `DTH_ORDER_CODE: ${orderCode}`;
                    codeDisplay.classList.add('code-found');
                    mainContext.strokeStyle = 'red';
                    mainContext.lineWidth = 2;
                    mainContext.strokeRect(rect.x, rect.y, rect.width, rect.height);
                    log(`Order code found: ${orderCode}`);
                    codeFound = true;
                    shouldStopScanning = true;
                    break;
                }
            } catch (err) {
                log(`Error during OCR: ${err}`);
            }

            roi.delete();
            roiCanvas.remove();
        }

        src.delete();
        gray.delete();
        contours.delete();
        hierarchy.delete();
        contoursColor.delete();

        if (codeFound) {
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    isScanning = false;
    log('Frame processing completed.');

    if (!codeFound && !shouldStopScanning) {
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
        setTimeout(resetScanState, 100); // Small delay to ensure the scanning loop has time to stop
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
    contoursCanvas.width = video.videoWidth;
    contoursCanvas.height = video.videoHeight;
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