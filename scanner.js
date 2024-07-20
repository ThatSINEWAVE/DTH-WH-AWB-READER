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



function log(message) {
    console.log(message);
    logDisplay.innerHTML += `<div>${message}</div>`;
    logDisplay.scrollTop = logDisplay.scrollHeight;
}

function getCameraStream() {
    const constraints = {
        video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: { ideal: 'environment' }
        }
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            video.srcObject = stream;
            video.play();
            log('CAMERA ACCESSED SUCCESSFULLY.');
        })
        .catch(err => {
            log(`Error accessing camera: ${err}`);
        });
}

getCameraStream();

const orderCodePattern = /(?:SGRO|sgro|RO|ro)\d{10}/;

function processFrame() {
    if (isScanning) return;
    isScanning = true;

    log('PROCESSING FRAME...');

    mainCanvas.width = video.videoWidth;
    mainCanvas.height = video.videoHeight;
    mainContext.drawImage(video, 0, 0, mainCanvas.width, mainCanvas.height);

    // Process the image for better text recognition
    processedCanvas.width = mainCanvas.width;
    processedCanvas.height = mainCanvas.height;
    const processedImageData = enhanceImage(mainContext.getImageData(0, 0, mainCanvas.width, mainCanvas.height));
    processedContext.putImageData(processedImageData, 0, 0);

    // Perform OCR on the processed image
    Tesseract.recognize(processedCanvas, 'eng', {
        tessedit_char_whitelist: 'SGROsgro0123456789',
        tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE
    }).then(({ data: { text } }) => {
        const code = extractCode(text);
        if (code) {
            codeDisplay.textContent = `CODE: ${code}`;
            codeDisplay.classList.add('code-found');
            log(`CODE: ${code}`);
            playBeep('success');
        } else {
            log('NO VALID CODE FOUND IN THIS FRAME.');
            codeDisplay.textContent = 'CODE: NOT FOUND';
            codeDisplay.classList.remove('code-found');
            playBeep('failure');
        }
        isScanning = false;
        log('FRAME PROCESSING COMPLETED.');
        scanButton.textContent = 'SCAN';
    });
}

function enhanceImage(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const threshold = 128;
        const newValue = avg > threshold ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = newValue;
    }
    return imageData;
}

function extractCode(text) {
    const match = text.match(orderCodePattern);
    return match ? match[0].toUpperCase() : null;
}

function playBeep(type) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    oscillator.connect(audioContext.destination);

    switch(type) {
        case 'success':
            oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.1);
            break;
        case 'failure':
            oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.2);
            break;
    }
}

scanButton.addEventListener('click', processFrame);

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
    const codeText = codeDisplay.textContent.replace('CODE: ', '');
    if (codeText && codeText !== 'WAITING FOR SCAN' && codeText !== 'NOT FOUND') {
        copyToClipboard(codeText);
    }
});

// Initial setup
codeDisplay.textContent = 'CODE: WAITING FOR SCAN';
log('READY FOR SCANNING');
getCameraStream();