document.addEventListener('DOMContentLoaded', function() {
    // State Management
    const AppState = {
        userSession: null,
        playlist: {
            tracks: [],
            currentIndex: 0,
            history: []
        },
        searchResults: [],
        currentTrack: null,
        currentDownloadId: null,
        isPlaying: false,
        isShuffled: false,
        isRepeating: false,
        volume: 80,
        searchPage: 1,
        isLoading: false,
        audioContext: null,
        audioElement: null,
        downloadCheckInterval: null
    };

    // DOM Elements
    const elements = {
        // Sidebar
        sidebar: document.querySelector('.sidebar'),
        toggleSidebar: document.getElementById('toggle-sidebar'),
        clearPlaylist: document.getElementById('clear-playlist'),
        playlistTracks: document.getElementById('playlist-tracks'),
        playlistEmpty: document.getElementById('playlist-empty'),
        playlistCount: document.getElementById('playlist-count'),
        playlistDuration: document.getElementById('playlist-duration'),
        recentHistory: document.getElementById('recent-history'),
        sessionId: document.getElementById('session-id'),
        
        // Search
        searchQuery: document.getElementById('search-query'),
        searchBtn: document.getElementById('search-btn'),
        searchFilter: document.getElementById('search-filter'),
        searchSort: document.getElementById('search-sort'),
        searchResults: document.getElementById('search-results'),
        resultsContainer: document.getElementById('results-container'),
        resultsCount: document.getElementById('results-count'),
        loadMore: document.getElementById('load-more'),
        
        // Tabs
        searchTabs: document.querySelectorAll('.search-tab'),
        musicSearchTab: document.getElementById('music-search-tab'),
        urlSearchTab: document.getElementById('url-search-tab'),
        
        // URL Input
        youtubeUrl: document.getElementById('youtube-url'),
        getInfoBtn: document.getElementById('get-info-btn'),
        videoInfo: document.getElementById('video-info'),
        videoTitle: document.getElementById('video-title'),
        videoThumbnail: document.getElementById('video-thumbnail'),
        videoUploader: document.getElementById('video-uploader'),
        videoDuration: document.getElementById('video-duration'),
        videoDescription: document.getElementById('video-description'),
        addToPlaylistBtn: document.getElementById('add-to-playlist-btn'),
        streamNowBtn: document.getElementById('stream-now-btn'),
        
        // Player
        playerSection: document.getElementById('player-section'),
        noPlayer: document.getElementById('no-player'),
        playerStatus: document.getElementById('player-status'),
        nowPlayingThumbnail: document.getElementById('now-playing-thumbnail'),
        nowPlayingTitle: document.getElementById('now-playing-title'),
        nowPlayingArtist: document.getElementById('now-playing-artist'),
        nowPlayingDuration: document.getElementById('now-playing-duration'),
        nowPlayingPosition: document.getElementById('now-playing-position'),
        progressFill: document.getElementById('progress-fill'),
        progressHandle: document.getElementById('progress-handle'),
        progressText: document.getElementById('progress-text'),
        totalDuration: document.getElementById('total-duration'),
        playBtn: document.getElementById('play-btn'),
        pauseBtn: document.getElementById('pause-btn'),
        prevBtn: document.getElementById('prev-btn'),
        nextBtn: document.getElementById('next-btn'),
        stopBtn: document.getElementById('stop-btn'),
        shuffleBtn: document.getElementById('shuffle-btn'),
        repeatBtn: document.getElementById('repeat-btn'),
        muteBtn: document.getElementById('mute-btn'),
        volumeSlider: document.getElementById('volume-slider'),
        likeTrack: document.getElementById('like-track'),
        clearQueueBtn: document.getElementById('clear-queue-btn'),
        queuePosition: document.getElementById('queue-position'),
        queueTotal: document.getElementById('queue-total'),
        browseMusic: document.getElementById('browse-music'),
        
        // Download Progress
        downloadProgress: document.getElementById('download-progress'),
        downloadProgressFill: document.getElementById('download-progress-fill'),
        downloadProgressText: document.getElementById('download-progress-text'),
        downloadSpeedText: document.getElementById('download-speed-text'),
        
        // Loading
        loadingOverlay: document.getElementById('loading-overlay'),
        loadingMessage: document.getElementById('loading-message'),
        
        // Other
        currentYear: document.getElementById('current-year'),
        refreshApp: document.getElementById('refresh-app'),
        exportPlaylist: document.getElementById('export-playlist'),
        importPlaylist: document.getElementById('import-playlist'),
        toastContainer: document.getElementById('toast-container')
    };

    // Initialize Application
    function initApp() {
        // Set current year
        elements.currentYear.textContent = new Date().getFullYear();
        
        // Generate session ID if not exists
        if (!AppState.userSession) {
            AppState.userSession = 'user_' + Math.random().toString(36).substr(2, 9);
            elements.sessionId.textContent = AppState.userSession;
        }
        
        // Load playlist from server
        loadPlaylist();
        
        // Initialize audio element
        initAudioPlayer();
        
        // Set up event listeners
        setupEventListeners();
        
        // Show initial state
        updatePlayerUI();
        
        console.log('YouTube Music Streamer initialized');
    }

    // Setup Event Listeners
    function setupEventListeners() {
        // Sidebar
        elements.toggleSidebar.addEventListener('click', toggleSidebar);
        elements.clearPlaylist.addEventListener('click', clearPlaylist);
        
        // Search
        elements.searchBtn.addEventListener('click', performSearch);
        elements.searchQuery.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
        elements.loadMore.addEventListener('click', loadMoreResults);
        
        // Tabs
        elements.searchTabs.forEach(tab => {
            tab.addEventListener('click', () => switchSearchTab(tab.dataset.tab));
        });
        
        // URL Input
        elements.getInfoBtn.addEventListener('click', getVideoInfo);
        elements.youtubeUrl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') getVideoInfo();
        });
        elements.addToPlaylistBtn.addEventListener('click', addCurrentVideoToPlaylist);
        elements.streamNowBtn.addEventListener('click', streamCurrentVideo);
        
        // Player Controls
        elements.playBtn.addEventListener('click', playAudio);
        elements.pauseBtn.addEventListener('click', pauseAudio);
        elements.prevBtn.addEventListener('click', playPrevious);
        elements.nextBtn.addEventListener('click', playNext);
        elements.stopBtn.addEventListener('click', stopAudio);
        elements.shuffleBtn.addEventListener('click', toggleShuffle);
        elements.repeatBtn.addEventListener('click', toggleRepeat);
        elements.muteBtn.addEventListener('click', toggleMute);
        elements.volumeSlider.addEventListener('input', updateVolume);
        elements.clearQueueBtn.addEventListener('click', clearPlaylist);
        elements.browseMusic.addEventListener('click', () => {
            switchSearchTab('music');
            elements.searchQuery.focus();
        });
        
        // Progress bar
        const progressBar = document.querySelector('.progress-bar');
        progressBar.addEventListener('click', (e) => {
            const rect = progressBar.getBoundingClientRect();
            const percentage = (e.clientX - rect.left) / rect.width;
            seekAudio(percentage);
        });
        
        // Other
        elements.refreshApp.addEventListener('click', () => location.reload());
        elements.exportPlaylist.addEventListener('click', exportPlaylist);
        elements.importPlaylist.addEventListener('click', importPlaylist);
        
        // Audio events
        if (AppState.audioElement) {
            AppState.audioElement.addEventListener('timeupdate', updateProgress);
            AppState.audioElement.addEventListener('ended', onTrackEnded);
            AppState.audioElement.addEventListener('error', onAudioError);
        }
    }

    // Initialize Audio Player
    function initAudioPlayer() {
        if (!AppState.audioElement) {
            AppState.audioElement = new Audio();
            AppState.audioElement.volume = AppState.volume / 100;
            
            // Set up audio events
            AppState.audioElement.addEventListener('play', () => {
                AppState.isPlaying = true;
                updatePlayerUI();
            });
            
            AppState.audioElement.addEventListener('pause', () => {
                AppState.isPlaying = false;
                updatePlayerUI();
            });
            
            AppState.audioElement.addEventListener('timeupdate', updateProgress);
            AppState.audioElement.addEventListener('ended', onTrackEnded);
            AppState.audioElement.addEventListener('error', onAudioError);
        }
    }

    // Search Functions
    async function performSearch() {
        const query = elements.searchQuery.value.trim();
        
        if (!query || query.length < 2) {
            showToast('Please enter at least 2 characters', 'warning');
            return;
        }
        
        showLoading('Searching for music...');
        
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            AppState.searchResults = data.results || [];
            AppState.searchPage = 1;
            
            displaySearchResults(AppState.searchResults);
            showToast(`Found ${AppState.searchResults.length} results`, 'success');
            
        } catch (error) {
            console.error('Search error:', error);
            showToast(`Search failed: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    function displaySearchResults(results) {
        if (!results || results.length === 0) {
            elements.resultsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>No results found</p>
                    <p class="small">Try a different search term</p>
                </div>
            `;
            elements.searchResults.classList.add('hidden');
            return;
        }
        
        elements.resultsContainer.innerHTML = '';
        elements.resultsCount.textContent = `${results.length} results`;
        
        results.forEach((result, index) => {
            const duration = formatDuration(result.duration);
            const resultElement = document.createElement('div');
            resultElement.className = 'result-item';
            resultElement.innerHTML = `
                <div class="result-thumbnail">
                    <img src="${result.thumbnail || 'https://via.placeholder.com/300x160?text=No+Thumbnail'}" 
                         alt="${result.title}">
                    <div class="result-overlay">
                        <i class="fas fa-play-circle"></i>
                    </div>
                </div>
                <div class="result-info">
                    <h4 title="${result.title}">${result.title}</h4>
                    <div class="result-meta">
                        <span><i class="fas fa-user"></i> ${result.uploader || 'Unknown'}</span>
                        <span><i class="fas fa-clock"></i> ${duration}</span>
                    </div>
                    <div class="result-actions">
                        <button class="btn btn-sm btn-success add-to-playlist" data-index="${index}">
                            <i class="fas fa-plus"></i> Add
                        </button>
                        <button class="btn btn-sm btn-primary play-now" data-index="${index}">
                            <i class="fas fa-play"></i> Play
                        </button>
                    </div>
                </div>
            `;
            
            elements.resultsContainer.appendChild(resultElement);
        });
        
        // Add event listeners to buttons
        document.querySelectorAll('.add-to-playlist').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                addTrackToPlaylist(AppState.searchResults[index]);
            });
        });
        
        document.querySelectorAll('.play-now').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                playTrackNow(AppState.searchResults[index]);
            });
        });
        
        // Add click event to result items
        document.querySelectorAll('.result-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                showTrackInfo(AppState.searchResults[index]);
            });
        });
        
        elements.searchResults.classList.remove('hidden');
        elements.loadMore.classList.toggle('hidden', results.length < 10);
    }

    function loadMoreResults() {
        // For now, just show a message
        // In a real app, you would fetch more results from the server
        showToast('Loading more results...', 'info');
    }

    // Playlist Functions
    async function loadPlaylist() {
        try {
            const response = await fetch('/api/playlist');
            const data = await response.json();
            
            AppState.playlist.tracks = data.tracks || [];
            AppState.playlist.currentIndex = data.current_index || 0;
            AppState.playlist.history = data.history || [];
            
            updatePlaylistUI();
            updateHistoryUI();
            
        } catch (error) {
            console.error('Error loading playlist:', error);
        }
    }

    async function addTrackToPlaylist(track) {
        if (!track || !track.id) {
            showToast('Invalid track data', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/playlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(track)
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Update local state
                AppState.playlist.tracks.push(track);
                updatePlaylistUI();
                showToast(`Added "${track.title}" to playlist`, 'success');
            } else {
                showToast(data.message || 'Failed to add track', 'warning');
            }
            
        } catch (error) {
            console.error('Error adding track:', error);
            showToast('Failed to add track to playlist', 'error');
        }
    }

    async function removeTrackFromPlaylist(trackId) {
        try {
            const response = await fetch('/api/playlist', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ track_id: trackId })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Update local state
                AppState.playlist.tracks = AppState.playlist.tracks.filter(t => t.id !== trackId);
                updatePlaylistUI();
                showToast('Track removed from playlist', 'success');
            }
            
        } catch (error) {
            console.error('Error removing track:', error);
            showToast('Failed to remove track', 'error');
        }
    }

    async function setCurrentTrack(trackId) {
        try {
            const response = await fetch('/api/playlist/current', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ track_id: trackId })
            });
            
            const data = await response.json();
            
            if (data.success) {
                AppState.playlist.currentIndex = data.current_index;
                AppState.currentTrack = data.track;
                playTrackNow(data.track);
            }
            
        } catch (error) {
            console.error('Error setting current track:', error);
        }
    }

    async function playPrevious() {
        try {
            const response = await fetch('/api/playlist/prev', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();
            
            if (data.success) {
                AppState.playlist.currentIndex = data.current_index;
                AppState.currentTrack = data.track;
                playTrackNow(data.track);
            } else {
                showToast(data.message || 'Cannot play previous track', 'warning');
            }
            
        } catch (error) {
            console.error('Error playing previous track:', error);
        }
    }

    async function playNext() {
        try {
            const response = await fetch('/api/playlist/next', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();
            
            if (data.success) {
                AppState.playlist.currentIndex = data.current_index;
                AppState.currentTrack = data.track;
                playTrackNow(data.track);
            } else {
                showToast(data.message || 'Cannot play next track', 'warning');
            }
            
        } catch (error) {
            console.error('Error playing next track:', error);
        }
    }

    async function clearPlaylist() {
        if (!AppState.playlist.tracks.length) {
            showToast('Playlist is already empty', 'info');
            return;
        }
        
        if (confirm('Are you sure you want to clear the entire playlist?')) {
            try {
                const response = await fetch('/api/playlist/clear', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    AppState.playlist.tracks = [];
                    AppState.playlist.currentIndex = 0;
                    AppState.currentTrack = null;
                    updatePlaylistUI();
                    stopAudio();
                    showToast('Playlist cleared', 'success');
                }
                
            } catch (error) {
                console.error('Error clearing playlist:', error);
                showToast('Failed to clear playlist', 'error');
            }
        }
    }

    function updatePlaylistUI() {
        const tracks = AppState.playlist.tracks;
        
        // Update playlist count and duration
        elements.playlistCount.textContent = `${tracks.length} track${tracks.length !== 1 ? 's' : ''}`;
        
        const totalDuration = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
        elements.playlistDuration.textContent = formatDuration(totalDuration);
        
        // Show/hide empty state
        elements.playlistEmpty.classList.toggle('hidden', tracks.length > 0);
        elements.playlistTracks.classList.toggle('hidden', tracks.length === 0);
        
        // Update playlist tracks
        if (tracks.length > 0) {
            elements.playlistTracks.innerHTML = '';
            
            tracks.forEach((track, index) => {
                const isCurrent = index === AppState.playlist.currentIndex;
                const duration = formatDuration(track.duration);
                
                const li = document.createElement('li');
                li.className = `playlist-track ${isCurrent ? 'playing' : ''}`;
                li.innerHTML = `
                    <img class="track-thumb" src="${track.thumbnail || 'https://via.placeholder.com/40?text=No+Thumb'}" 
                         alt="${track.title}">
                    <div class="track-info">
                        <h4 title="${track.title}">${track.title}</h4>
                        <p>${track.uploader || 'Unknown'}</p>
                    </div>
                    <span class="track-duration">${duration}</span>
                    <div class="track-actions">
                        <button class="btn-icon play-track" title="Play" data-track-id="${track.id}">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="btn-icon remove-track" title="Remove" data-track-id="${track.id}">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
                
                elements.playlistTracks.appendChild(li);
                
                // Add event listeners
                li.querySelector('.play-track').addEventListener('click', (e) => {
                    e.stopPropagation();
                    setCurrentTrack(track.id);
                });
                
                li.querySelector('.remove-track').addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeTrackFromPlaylist(track.id);
                });
                
                li.addEventListener('click', () => {
                    setCurrentTrack(track.id);
                });
            });
        }
        
        // Update queue info in player
        elements.queueTotal.textContent = tracks.length;
        elements.queuePosition.textContent = tracks.length > 0 ? AppState.playlist.currentIndex + 1 : '-';
    }

    function updateHistoryUI() {
        const history = AppState.playlist.history.slice(0, 5); // Show last 5
        
        if (history.length === 0) {
            elements.recentHistory.innerHTML = '<p class="empty-state small">No recent tracks</p>';
            return;
        }
        
        elements.recentHistory.innerHTML = '';
        
        history.forEach(item => {
            const timeAgo = getTimeAgo(item.played_at);
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `
                <span class="history-title" title="${item.title}">${item.title}</span>
                <span class="history-time">${timeAgo}</span>
            `;
            elements.recentHistory.appendChild(div);
        });
    }

    // Track Playback Functions
    async function playTrackNow(track) {
        if (!track) return;
        
        showLoading(`Loading "${track.title}"...`);
        
        try {
            // Start download
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    video_id: track.id,
                    url: track.url
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            AppState.currentDownloadId = data.download_id;
            
            // Start checking download progress
            checkDownloadProgress();
            
            // Update UI
            AppState.currentTrack = track;
            updatePlayerTrackInfo(track);
            
            // Show player
            elements.playerSection.classList.remove('hidden');
            elements.noPlayer.classList.add('hidden');
            
            // Set player status
            elements.playerStatus.textContent = 'Downloading...';
            elements.playerStatus.className = 'status-idle';
            
            showToast(`Loading "${track.title}"...`, 'info');
            
        } catch (error) {
            console.error('Error playing track:', error);
            showToast(`Failed to play track: ${error.message}`, 'error');
            hideLoading();
        }
    }

    async function checkDownloadProgress() {
        if (!AppState.currentDownloadId) return;
        
        if (AppState.downloadCheckInterval) {
            clearInterval(AppState.downloadCheckInterval);
        }
        
        AppState.downloadCheckInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/status/${AppState.currentDownloadId}`);
                const data = await response.json();
                
                if (data.error) {
                    throw new Error(data.error);
                }
                
                // Update download progress
                if (data.progress) {
                    const progress = parseFloat(data.progress.replace('%', '')) || 0;
                    elements.downloadProgressFill.style.width = `${progress}%`;
                    elements.downloadProgressText.textContent = data.progress;
                    
                    if (data.speed) {
                        elements.downloadSpeedText.textContent = data.speed;
                    }
                    
                    // Show download progress
                    elements.downloadProgress.classList.remove('hidden');
                }
                
                // Handle download completion
                if (data.status === 'completed') {
                    clearInterval(AppState.downloadCheckInterval);
                    AppState.downloadCheckInterval = null;
                    
                    // Hide download progress
                    elements.downloadProgress.classList.add('hidden');
                    
                    // Set audio source and play
                    const streamUrl = `/api/stream/${AppState.currentDownloadId}`;
                    AppState.audioElement.src = streamUrl;
                    
                    // Update player status
                    elements.playerStatus.textContent = 'Playing';
                    elements.playerStatus.className = 'status-playing';
                    
                    // Play audio
                    await AppState.audioElement.play();
                    
                    showToast(`Now playing: "${data.title}"`, 'success');
                    
                    // Update track info with actual duration from server
                    if (data.duration) {
                        elements.totalDuration.textContent = formatDuration(data.duration);
                        elements.nowPlayingDuration.textContent = formatDuration(data.duration);
                    }
                    
                } else if (data.status === 'error') {
                    clearInterval(AppState.downloadCheckInterval);
                    AppState.downloadCheckInterval = null;
                    
                    showToast(`Download failed: ${data.error}`, 'error');
                    elements.playerStatus.textContent = 'Error';
                    elements.playerStatus.className = 'status-idle';
                }
                
            } catch (error) {
                console.error('Error checking download progress:', error);
                clearInterval(AppState.downloadCheckInterval);
                AppState.downloadCheckInterval = null;
            }
        }, 1000);
    }

    function playAudio() {
        if (AppState.audioElement.src) {
            AppState.audioElement.play();
            showToast('Resumed playback', 'info');
        } else if (AppState.playlist.tracks.length > 0) {
            // If no audio source but playlist has tracks, play current track
            const currentTrack = AppState.playlist.tracks[AppState.playlist.currentIndex];
            if (currentTrack) {
                playTrackNow(currentTrack);
            }
        }
    }

    function pauseAudio() {
        AppState.audioElement.pause();
        showToast('Playback paused', 'info');
    }

    function stopAudio() {
        AppState.audioElement.pause();
        AppState.audioElement.currentTime = 0;
        AppState.isPlaying = false;
        AppState.currentTrack = null;
        
        // Hide player, show "no player" message
        elements.playerSection.classList.add('hidden');
        elements.noPlayer.classList.remove('hidden');
        
        showToast('Playback stopped', 'info');
    }

    function seekAudio(percentage) {
        if (AppState.audioElement.duration) {
            AppState.audioElement.currentTime = AppState.audioElement.duration * percentage;
        }
    }

    function updateProgress() {
        if (!AppState.audioElement.duration) return;
        
        const currentTime = AppState.audioElement.currentTime;
        const duration = AppState.audioElement.duration;
        const percentage = (currentTime / duration) * 100;
        
        elements.progressFill.style.width = `${percentage}%`;
        elements.progressHandle.style.left = `${percentage}%`;
        
        elements.progressText.textContent = formatDuration(currentTime);
        
        // Update now playing position
        elements.nowPlayingPosition.textContent = formatDuration(currentTime);
    }

    function onTrackEnded() {
        if (AppState.isRepeating) {
            // Repeat current track
            AppState.audioElement.currentTime = 0;
            AppState.audioElement.play();
        } else {
            // Play next track
            playNext();
        }
    }

    function onAudioError(error) {
        console.error('Audio error:', error);
        showToast('Error playing audio. Trying next track...', 'error');
        
        // Try to play next track
        setTimeout(() => playNext(), 1000);
    }

    // URL Input Functions
    async function getVideoInfo() {
        const url = elements.youtubeUrl.value.trim();
        
        if (!url) {
            showToast('Please enter a YouTube URL', 'warning');
            return;
        }
        
        showLoading('Getting video information...');
        
        try {
            const response = await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Display video info
            elements.videoTitle.textContent = data.title;
            elements.videoThumbnail.src = data.thumbnail || 'https://via.placeholder.com/300x120?text=No+Thumbnail';
            elements.videoUploader.textContent = data.uploader;
            elements.videoDuration.textContent = formatDuration(data.duration);
            elements.videoDescription.textContent = data.description || 'No description available';
            
            // Store current video info for later use
            AppState.currentVideoInfo = data;
            
            // Show video info section
            elements.videoInfo.classList.remove('hidden');
            
            showToast('Video information loaded', 'success');
            
        } catch (error) {
            console.error('Error getting video info:', error);
            showToast(`Failed to get video info: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    async function addCurrentVideoToPlaylist() {
        if (!AppState.currentVideoInfo) {
            showToast('No video information available', 'warning');
            return;
        }
        
        await addTrackToPlaylist(AppState.currentVideoInfo);
    }

    async function streamCurrentVideo() {
        if (!AppState.currentVideoInfo) {
            showToast('No video information available', 'warning');
            return;
        }
        
        await playTrackNow(AppState.currentVideoInfo);
    }

    // UI Update Functions
    function updatePlayerUI() {
        // Update play/pause buttons
        elements.playBtn.classList.toggle('hidden', AppState.isPlaying);
        elements.pauseBtn.classList.toggle('hidden', !AppState.isPlaying);
        
        // Update shuffle/repeat buttons
        elements.shuffleBtn.style.color = AppState.isShuffled ? 'var(--primary-color)' : '';
        elements.repeatBtn.style.color = AppState.isRepeating ? 'var(--primary-color)' : '';
        
        // Update volume icon
        const volume = AppState.volume;
        let volumeIcon = 'fa-volume-up';
        if (volume === 0) volumeIcon = 'fa-volume-mute';
        else if (volume < 50) volumeIcon = 'fa-volume-down';
        
        elements.muteBtn.innerHTML = `<i class="fas ${volumeIcon}"></i>`;
        elements.volumeSlider.value = volume;
    }

    function updatePlayerTrackInfo(track) {
        if (!track) return;
        
        elements.nowPlayingTitle.textContent = track.title;
        elements.nowPlayingArtist.textContent = track.uploader || 'Unknown';
        elements.nowPlayingThumbnail.src = track.thumbnail || 'https://via.placeholder.com/100?text=No+Thumb';
        elements.nowPlayingDuration.textContent = formatDuration(track.duration);
        elements.totalDuration.textContent = formatDuration(track.duration);
        
        // Update queue position
        if (AppState.playlist.tracks.length > 0) {
            const currentIndex = AppState.playlist.tracks.findIndex(t => t.id === track.id);
            if (currentIndex !== -1) {
                elements.queuePosition.textContent = currentIndex + 1;
            }
        }
    }

    // Utility Functions
    function formatDuration(seconds) {
        if (!seconds) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function getTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() / 1000) - timestamp);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    function switchSearchTab(tab) {
        // Update active tab
        elements.searchTabs.forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        
        // Show/hide tab content
        elements.musicSearchTab.classList.toggle('active', tab === 'music');
        elements.urlSearchTab.classList.toggle('active', tab === 'url');
        
        // Focus appropriate input
        if (tab === 'music') {
            elements.searchQuery.focus();
        } else {
            elements.youtubeUrl.focus();
        }
    }

    function toggleSidebar() {
        elements.sidebar.classList.toggle('collapsed');
        const icon = elements.toggleSidebar.querySelector('i');
        icon.classList.toggle('fa-chevron-left');
        icon.classList.toggle('fa-chevron-right');
    }

    function toggleShuffle() {
        AppState.isShuffled = !AppState.isShuffled;
        updatePlayerUI();
        showToast(AppState.isShuffled ? 'Shuffle enabled' : 'Shuffle disabled', 'info');
    }

    function toggleRepeat() {
        AppState.isRepeating = !AppState.isRepeating;
        updatePlayerUI();
        showToast(AppState.isRepeating ? 'Repeat enabled' : 'Repeat disabled', 'info');
    }

    function toggleMute() {
        const newVolume = AppState.volume === 0 ? 80 : 0;
        updateVolume(newVolume);
        elements.volumeSlider.value = newVolume;
        
        showToast(newVolume === 0 ? 'Muted' : 'Unmuted', 'info');
    }

    function updateVolume(value) {
        AppState.volume = parseInt(value);
        AppState.audioElement.volume = AppState.volume / 100;
        updatePlayerUI();
    }

    function showTrackInfo(track) {
        // For now, just show a toast
        // In a full implementation, you might show a modal with detailed info
        showToast(`"${track.title}" by ${track.uploader || 'Unknown'}`, 'info');
    }

    function exportPlaylist() {
        if (AppState.playlist.tracks.length === 0) {
            showToast('Playlist is empty', 'warning');
            return;
        }
        
        const playlistData = {
            name: 'YouTube Music Playlist',
            exported: new Date().toISOString(),
            tracks: AppState.playlist.tracks
        };
        
        const dataStr = JSON.stringify(playlistData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `youtube-playlist-${new Date().toISOString().slice(0,10)}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        showToast('Playlist exported', 'success');
    }

    function importPlaylist() {
        // Create file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const playlistData = JSON.parse(text);
                
                if (!playlistData.tracks || !Array.isArray(playlistData.tracks)) {
                    throw new Error('Invalid playlist file format');
                }
                
                // Add each track to playlist
                let added = 0;
                for (const track of playlistData.tracks) {
                    await addTrackToPlaylist(track);
                    added++;
                }
                
                showToast(`Imported ${added} tracks from playlist`, 'success');
                
            } catch (error) {
                console.error('Error importing playlist:', error);
                showToast(`Failed to import playlist: ${error.message}`, 'error');
            }
        };
        
        input.click();
    }

    function showLoading(message = 'Loading...') {
        elements.loadingMessage.textContent = message;
        elements.loadingOverlay.classList.remove('hidden');
        AppState.isLoading = true;
    }

    function hideLoading() {
        elements.loadingOverlay.classList.add('hidden');
        AppState.isLoading = false;
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = 'fa-info-circle';
        if (type === 'success') icon = 'fa-check-circle';
        if (type === 'error') icon = 'fa-exclamation-circle';
        if (type === 'warning') icon = 'fa-exclamation-triangle';
        
        toast.innerHTML = `
            <i class="fas ${icon}"></i>
            <div class="toast-content">
                <h4>${type.charAt(0).toUpperCase() + type.slice(1)}</h4>
                <p>${message}</p>
            </div>
            <button class="toast-close">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        elements.toastContainer.appendChild(toast);
        
        // Add close button event
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        });
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = 'slideOutRight 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }

    // Initialize the application
    initApp();
});
