const fs = require('fs');
const https = require('https');
const path = require('path');
const { execSync } = require('child_process');

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
            } else if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            } else {
                reject(`Failed to download: ${response.statusCode}`);
            }
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function main() {
    console.log("Checking latest whisper.cpp release...");
    const options = {
        headers: { 'User-Agent': 'Node.js' }
    };
    
        const assetUrl = 'https://github.com/ggerganov/whisper.cpp/releases/download/v1.6.2/whisper-bin-x64.zip';
        
        console.log(`Downloading ${assetUrl}...`);
        const zipPath = path.join(__dirname, '..', 'whisper-bin-x64.zip');
        await downloadFile(assetUrl, zipPath);
            
            console.log("Extracting...");
            execSync(`powershell -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${path.join(__dirname, '..', 'bin', 'whisper')}'"`);
            fs.unlinkSync(zipPath);
            
            console.log("Downloading model ggml-base.en.bin...");
            const modelUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';
            const modelPath = path.join(__dirname, '..', 'models', 'ggml-base.en.bin');
            await downloadFile(modelUrl, modelPath);
            
            console.log("Setup complete.");
}

main();
