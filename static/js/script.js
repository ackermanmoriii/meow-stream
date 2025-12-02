document.addEventListener('DOMDOMContentLoaded', function() {
    // DOM Elements
    const urlInput = document.getElementById('youtube-url');
    const getInfoBtn = document.getElementById('get-info-btn');
    const videoInfo = document.getElementById('video-info');
    const videoTitle = document.getElementById('video-title');
    const videoThumbnail = document.getElementById('video-thumbnail');
    const videoDuration = document.getElementById('video-duration');
    const videoSize = document.getElementById('video-size');
    const downloadBtn = document.getElementById('download-btn');
    const streamBtn = document.getElementById('stream-btn');
    const downloadProgress = document.getElementById('download-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const speedText = document.getElementById('speed-text');
    const downloadControls = document.getElementById('download-controls');
    const playBtn = document.getElementById('play-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const playerSection = document.getElementById('player-section');
    const audioPlayer = document.getElementById('audio-player');
    const nowPlayingTitle = document.getElementById('now-playing-title');
    const nowPlayingStatus = document.getElementById('now-playing-status');
    const closePlayer = document.getElementById('close-player');
    const clearAllBtn = document.getElementById('clear-all');
    const refreshBtn = document.getElementById('refresh-page');
    const formatSelect = document.getElementById('format-select');
    
    // State variables
    let currentVideoInfo = null;
    let currentDownloadId = null;
    let downloadCheckInterval = null;
    let currentAudioUrl = null;
    
    // Set current year in footer
    document.getElementById('current-year').textContent = new Date().getFullYear();
    
    // Event Listeners
    getInfoBtn.addEventListener('click', getVideoInfo);
    downloadBtn.addEventListener('click', startDownload);
    streamBtn.addEventListener('click', startStreaming);
    playBtn.addEventListener('click', playDownloadedAudio);
    cancelBtn.addEventListener('click', cancelDownload);
    closePlayer.addEventListener('click', closeAudioPlayer);
    clearAllBtn.addEventListener('click', clearAll);
    refreshBtn.addEventListener('click', () => location.reload());
    
    // Allow Enter key to trigger Get Info
    urlInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            getVideoInfo();
        }
    });
    
    // Functions
    async function getVideoInfo() {
        const url = urlInput.value.trim();
        
        if (!url) {
            showAlert('Please enter a YouTube URL', 'error');
            return;
        }
        
        // Simple URL validation
        if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
            showAlert('Please enter a valid YouTube URL', 'error');
            return;
        }
        
        getInfoBtn.disabled = true;
        getInfoBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        
        try {
            const response = await fetch('/api/info', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to get video info');
            }
            
            currentVideoInfo = data;
            
            // Update UI with video info
            videoTitle.textContent = data.title;
            videoThumbnail.src = data.thumbnail;
            videoThumbnail.alt = data.title;
            
            // Format duration
            const duration = data.duration;
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            videoDuration.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // Estimate file size (approximate)
            const sizeMB = (duration * 0.1).toFixed(1); // Rough estimate
            videoSize.textContent = `${sizeMB} MB`;
            
            // Show video info section
            videoInfo.classList.remove('hidden');
            
            showAlert('Video information loaded successfully!', 'success');
            
        } catch (error) {
            console.error('Error getting video info:', error);
            showAlert(`Error: ${error.message}`, 'error');
        } finally {
            getInfoBtn.disabled = false;
            getInfoBtn.innerHTML = '<i class="fas fa-info-circle"></i> Get Info';
        }
    }
    
    async function startDownload() {
        if (!currentVideoInfo) {
            showAlert('Please get video info first', 'error');
            return;
        }
        
        const url = urlInput.value.trim();
        const formatId = formatSelect.value;
        
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';
        
        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    url, 
                    format_id: formatId 
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to start download');
            }
            
            currentDownloadId = data.download_id;
            
            // Show download progress section
            downloadProgress.classList.remove('hidden');
            videoInfo.classList.add('hidden');
            
            // Start checking download progress
            checkDownloadProgress();
            
            showAlert('Download started!', 'success');
            
        } catch (error) {
            console.error('Error starting download:', error);
            showAlert(`Error: ${error.message}`, 'error');
        } finally {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download Audio';
        }
    }
    
    async function startStreaming() {
        if (!currentVideoInfo) {
            showAlert('Please get video info first', 'error');
            return;
        }
        
        streamBtn.disabled = true;
        streamBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';
        
        try {
            // For streaming, we'll download first then play
            const url = urlInput.value.trim();
            const formatId = formatSelect.value;
            
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    url, 
                    format_id: formatId 
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to start streaming');
            }
            
            currentDownloadId = data.download_id;
            
            // Show download progress section
            downloadProgress.classList.remove('hidden');
            videoInfo.classList.add('hidden');
            
            // Start checking download progress for streaming
            checkDownloadProgress(true);
            
            showAlert('Preparing stream...', 'success');
            
        } catch (error) {
            console.error('Error starting stream:', error);
            showAlert(`Error: ${error.message}`, 'error');
        } finally {
            streamBtn.disabled = false;
            streamBtn.innerHTML = '<i class="fas fa-play"></i> Stream Now';
        }
    }
    
    async function checkDownloadProgress(forStreaming = false) {
        if (!currentDownloadId) return;
        
        if (downloadCheckInterval) {
            clearInterval(downloadCheckInterval);
        }
        
        downloadCheckInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/status/${currentDownloadId}`);
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to check download status');
                }
                
                // Update progress
                if (data.progress) {
                    const progress = parseFloat(data.progress.replace('%', ''));
                    progressFill.style.width = `${progress}%`;
                    progressText.textContent = data.progress;
                    
                    if (data.speed) {
                        speedText.textContent = data.speed;
                    }
                }
                
                // Handle different statuses
                if (data.status === 'completed') {
                    clearInterval(downloadCheckInterval);
                    
                    progressFill.style.width = '100%';
                    progressText.textContent = '100%';
                    speedText.textContent = 'Completed';
                    
                    // Show download controls
                    downloadControls.classList.remove('hidden');
                    
                    // If this was for streaming, auto-play
                    if (forStreaming) {
                        setTimeout(() => {
                            playDownloadedAudio();
                        }, 1000);
                    }
                    
                    showAlert('Download completed!', 'success');
                    
                } else if (data.status === 'error') {
                    clearInterval(downloadCheckInterval);
                    showAlert(`Download error: ${data.error}`, 'error');
                    resetDownloadUI();
                }
                
            } catch (error) {
                console.error('Error checking progress:', error);
                clearInterval(downloadCheckInterval);
            }
        }, 1000);
    }
    
    async function playDownloadedAudio() {
        if (!currentDownloadId) {
            showAlert('No download in progress', 'error');
            return;
        }
        
        try {
            // Get download status to confirm it's completed
            const response = await fetch(`/api/status/${currentDownloadId}`);
            const data = await response.json();
            
            if (!response.ok || data.status !== 'completed') {
                throw new Error('Download is not complete yet');
            }
            
            // Set up audio player
            currentAudioUrl = `/api/stream/${currentDownloadId}`;
            audioPlayer.src = currentAudioUrl;
            nowPlayingTitle.textContent = data.title || 'Downloaded Audio';
            nowPlayingStatus.textContent = 'Ready to play';
            
            // Show player and hide download section
            playerSection.classList.remove('hidden');
            downloadProgress.classList.add('hidden');
            
            // Play audio
            setTimeout(() => {
                audioPlayer.play().catch(e => {
                    console.error('Error playing audio:', e);
                    nowPlayingStatus.textContent = 'Click play button to start';
                });
            }, 500);
            
            // Set up audio event listeners
            audioPlayer.onplaying = () => {
                nowPlayingStatus.textContent = 'Playing...';
            };
            
            audioPlayer.onpause = () => {
                nowPlayingStatus.textContent = 'Paused';
            };
            
            audioPlayer.onended = () => {
                nowPlayingStatus.textContent = 'Playback ended';
            };
            
            audioPlayer.onerror = () => {
                nowPlayingStatus.textContent = 'Error playing audio';
            };
            
        } catch (error) {
            console.error('Error playing audio:', error);
            showAlert(`Error: ${error.message}`, 'error');
        }
    }
    
    async function cancelDownload() {
        if (!currentDownloadId) return;
        
        // Clean up on server side
        try {
            await fetch('/api/cleanup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ download_id: currentDownloadId })
            });
        } catch (error) {
            console.error('Error cleaning up download:', error);
        }
        
        // Clear interval and reset UI
        if (downloadCheckInterval) {
            clearInterval(downloadCheckInterval);
            downloadCheckInterval = null;
        }
        
        resetDownloadUI();
        showAlert('Download cancelled', 'info');
    }
    
    function closeAudioPlayer() {
        playerSection.classList.add('hidden');
        
        // Pause audio
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        
        // Clean up download
        if (currentDownloadId) {
            fetch('/api/cleanup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ download_id: currentDownloadId })
            }).catch(e => console.error('Cleanup error:', e));
            
            currentDownloadId = null;
        }
    }
    
    function resetDownloadUI() {
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        speedText.textContent = '--';
        downloadControls.classList.add('hidden');
        downloadProgress.classList.add('hidden');
        
        if (currentDownloadId) {
            currentDownloadId = null;
        }
    }
    
    function clearAll() {
        urlInput.value = '';
        videoInfo.classList.add('hidden');
        downloadProgress.classList.add('hidden');
        playerSection.classList.add('hidden');
        
        // Reset audio player
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        audioPlayer.src = '';
        
        // Clean up any active download
        if (currentDownloadId) {
            fetch('/api/cleanup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ download_id: currentDownloadId })
            }).catch(e => console.error('Cleanup error:', e));
            
            currentDownloadId = null;
        }
        
        // Clear interval
        if (downloadCheckInterval) {
            clearInterval(downloadCheckInterval);
            downloadCheckInterval = null;
        }
        
        currentVideoInfo = null;
        currentAudioUrl = null;
        
        showAlert('All cleared!', 'info');
    }
    
    function showAlert(message, type = 'info') {
        // Remove any existing alerts
        const existingAlert = document.querySelector('.alert');
        if (existingAlert) {
            existingAlert.remove();
        }
        
        // Create alert element
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        
        // Set icon based on type
        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';
        if (type === 'info') icon = 'info-circle';
        
        alert.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
            <button class="alert-close"><i class="fas fa-times"></i></button>
        `;
        
        // Add styles
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            background: ${type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : '#d1ecf1'};
            color: ${type === 'success' ? '#155724' : type === 'error' ? '#721c24' : '#0c5460'};
            border: 1px solid ${type === 'success' ? '#c3e6cb' : type === 'error' ? '#f5c6cb' : '#bee5eb'};
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            z-index: 1000;
            max-width: 400px;
            animation: slideIn 0.3s ease;
        `;
        
        // Add close button functionality
        const closeBtn = alert.querySelector('.alert-close');
        closeBtn.addEventListener('click', () => {
            alert.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => alert.remove(), 300);
        });
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (document.body.contains(alert)) {
                alert.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => alert.remove(), 300);
            }
        }, 5000);
        
        // Add CSS animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(alert);
    }
    
    // Initialize
    console.log('YouTube Audio Streamer initialized');
});