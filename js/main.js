// DOM要素の取得
const uploadArea = document.getElementById('uploadArea');
const videoInput = document.getElementById('videoInput');
const settingsPanel = document.getElementById('settingsPanel');
const convertBtn = document.getElementById('convertBtn');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const previewArea = document.getElementById('previewArea');
const videoPreview = document.getElementById('videoPreview');
const gifPreview = document.getElementById('gifPreview');
const downloadBtn = document.getElementById('downloadBtn');

let selectedVideo = null;

// 初期化処理
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
});

// イベントリスナーの初期化
function initializeEventListeners() {
    // ファイルアップロード関連
    uploadArea.addEventListener('click', () => videoInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    videoInput.addEventListener('change', handleFileInputChange);
    
    // 変換ボタン
    convertBtn.addEventListener('click', handleConvertClick);
    
    // スムーズスクロール
    initializeSmoothScroll();
}

// ドラッグオーバー処理
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('dragover');
}

// ドラッグリーブ処理
function handleDragLeave() {
    uploadArea.classList.remove('dragover');
}

// ドロップ処理
function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect(files[0]);
    }
}

// ファイル入力変更処理
function handleFileInputChange(e) {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
}

// ファイル選択処理
function handleFileSelect(file) {
    if (!file.type.startsWith('video/')) {
        showError('動画ファイルを選択してください。');
        return;
    }

    if (file.size > 100 * 1024 * 1024) { // 100MB制限
        showError('ファイルサイズが大きすぎます。100MB以下のファイルを選択してください。');
        return;
    }

    selectedVideo = file;
    const url = URL.createObjectURL(file);
    videoPreview.src = url;
    
    settingsPanel.style.display = 'block';
    convertBtn.style.display = 'inline-block';
    
    uploadArea.innerHTML = `<p>✅ ${file.name} が選択されました</p>`;

    // 動画の長さを取得して設定を調整
    videoPreview.addEventListener('loadedmetadata', () => {
        const duration = videoPreview.duration;
        const durationInput = document.getElementById('duration');
        durationInput.max = duration;
        if (parseFloat(durationInput.value) > duration) {
            durationInput.value = Math.min(3, duration);
        }
        document.getElementById('startTime').max = Math.max(0, duration - 0.1);
    });
}

// 変換ボタンクリック処理
function handleConvertClick() {
    if (!selectedVideo) return;

    const startTime = parseFloat(document.getElementById('startTime').value);
    const duration = parseFloat(document.getElementById('duration').value);
    const width = parseInt(document.getElementById('width').value);
    const fps = parseInt(document.getElementById('fps').value);
    const quality = document.getElementById('quality').value;

    // バリデーション
    if (startTime < 0 || duration <= 0 || width < 50) {
        showError('設定値を確認してください。');
        return;
    }

    convertToGif(startTime, duration, width, fps, quality);
}

// GIF変換処理
function convertToGif(startTime, duration, width, fps, quality) {
    progressBar.style.display = 'block';
    convertBtn.disabled = true;
    convertBtn.textContent = '変換中...';
    progressFill.style.width = '0%';

    const video = document.createElement('video');
    video.src = URL.createObjectURL(selectedVideo);
    video.muted = true;

    video.addEventListener('loadedmetadata', () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // アスペクト比を維持して幅を設定
        const aspectRatio = video.videoHeight / video.videoWidth;
        canvas.width = width;
        canvas.height = Math.round(width * aspectRatio);

        // GIF設定
        const gif = new GIF({
            workers: 2,
            quality: getQualityValue(quality),
            width: canvas.width,
            height: canvas.height,
            workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
        });

        let frameCount = 0;
        const totalFrames = Math.floor(duration * fps);
        const frameInterval = 1 / fps;

        // フレームキャプチャ関数
        function captureFrame() {
            if (frameCount >= totalFrames) {
                gif.render();
                return;
            }

            const currentTime = startTime + (frameCount * frameInterval);
            
            // 動画の範囲チェック
            if (currentTime > video.duration) {
                gif.render();
                return;
            }

            video.currentTime = currentTime;

            video.addEventListener('seeked', function onSeeked() {
                video.removeEventListener('seeked', onSeeked);
                
                try {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    gif.addFrame(imageData, {
                        delay: Math.round(1000 / fps)
                    });

                    frameCount++;
                    const progress = (frameCount / totalFrames) * 100;
                    progressFill.style.width = progress + '%';

                    setTimeout(captureFrame, 50);
                } catch (error) {
                    console.error('Frame capture error:', error);
                    showError('フレームキャプチャ中にエラーが発生しました。');
                    resetConvertButton();
                }
            }, { once: true });
        }

        // GIF完成時の処理
        gif.on('finished', (blob) => {
            try {
                const url = URL.createObjectURL(blob);
                gifPreview.src = url;
                downloadBtn.href = url;
                downloadBtn.style.display = 'inline-block';
                
                previewArea.style.display = 'block';
                progressBar.style.display = 'none';
                
                // ファイルサイズを表示
                const sizeInMB = (blob.size / (1024 * 1024)).toFixed(2);
                gifPreview.title = `ファイルサイズ: ${sizeInMB}MB`;
                
                // ダウンロードファイル名を設定
                const originalName = selectedVideo.name.split('.').slice(0, -1).join('.');
                downloadBtn.download = `${originalName}_converted.gif`;
                
                resetConvertButton();
            } catch (error) {
                console.error('GIF creation error:', error);
                showError('GIF作成中にエラーが発生しました。');
                resetConvertButton();
            }
        });

        gif.on('progress', (progress) => {
            const totalProgress = ((frameCount / totalFrames) * 0.8 + progress * 0.2) * 100;
            progressFill.style.width = totalProgress + '%';
        });

        captureFrame();
    });

    video.addEventListener('error', () => {
        showError('動画の読み込み中にエラーが発生しました。');
        resetConvertButton();
    });

    video.load();
}

// 品質値の取得
function getQualityValue(quality) {
    switch (quality) {
        case 'high': return 1;
        case 'medium': return 10;
        case 'low': return 20;
        default: return 10;
    }
}

// 変換ボタンのリセット
function resetConvertButton() {
    convertBtn.disabled = false;
    convertBtn.textContent = 'GIFに変換';
}

// エラー表示
function showError(message) {
    alert(message);
    progressBar.style.display = 'none';
    resetConvertButton();
}

// スムーズスクロールの初期化
function initializeSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

// ユーティリティ関数：ファイルサイズの表示
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// メモリクリーンアップ
window.addEventListener('beforeunload', () => {
    if (videoPreview.src) {
        URL.revokeObjectURL(videoPreview.src);
    }
    if (gifPreview.src) {
        URL.revokeObjectURL(gifPreview.src);
    }
});