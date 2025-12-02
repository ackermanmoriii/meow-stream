import os
import re
import json
import hashlib
import time
import threading
import tempfile
import atexit
from flask import Flask, render_template, request, jsonify, send_file, session
from flask_cors import CORS
import yt_dlp
import requests
from urllib.parse import quote_plus

app = Flask(__name__)
CORS(app)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024
app.config['SECRET_KEY'] = os.urandom(24)
app.config['SESSION_TYPE'] = 'filesystem'

# YouTube API Key (optional - for enhanced search)
# Get your own API key from: https://console.cloud.google.com/apis
YT_API_KEY = os.environ.get('YT_API_KEY', '')

# In-memory storage for active downloads and playlists
active_downloads = {}
user_playlists = {}
search_cache = {}
MAX_CACHE_AGE = 3600  # 1 hour

def extract_video_id(url):
    """Extract YouTube video ID from URL"""
    patterns = [
        r'(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+)',
        r'(?:youtu\.be\/)([a-zA-Z0-9_-]+)',
        r'(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]+)',
        r'(?:youtube\.com\/v\/)([a-zA-Z0-9_-]+)'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    
    # Also check for video ID in shortened URLs
    if 'youtu.be/' in url:
        parts = url.split('youtu.be/')
        if len(parts) > 1:
            video_id = parts[1].split('?')[0]
            if len(video_id) == 11:
                return video_id
    return None

def get_user_session():
    """Get or create user session ID"""
    if 'user_id' not in session:
        session['user_id'] = hashlib.md5(str(time.time()).encode()).hexdigest()[:8]
    
    user_id = session['user_id']
    
    # Initialize user playlist if not exists
    if user_id not in user_playlists:
        user_playlists[user_id] = {
            'tracks': [],
            'current_index': 0,
            'history': []
        }
    
    return user_id

def download_audio_task(video_url, download_id, user_id):
    """Background task to download audio from YouTube"""
    try:
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': '%(title)s.%(ext)s',
            'quiet': True,
            'no_warnings': True,
            'extractaudio': True,
            'audioformat': 'mp3',
            'noplaylist': True,
            'progress_hooks': [lambda d: progress_hook(d, download_id)],
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)
            
            # Create temp file
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
            temp_file.close()
            
            # Update download options to save to temp file
            ydl_opts['outtmpl'] = temp_file.name.replace('.mp3', '')
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl2:
                ydl2.download([video_url])
            
            # Update active downloads
            active_downloads[download_id] = {
                'status': 'completed',
                'temp_file': temp_file.name,
                'title': info.get('title', 'Unknown'),
                'duration': info.get('duration', 0),
                'thumbnail': info.get('thumbnail', ''),
                'uploader': info.get('uploader', ''),
                'user_id': user_id
            }
            
    except Exception as e:
        active_downloads[download_id] = {
            'status': 'error',
            'error': str(e),
            'user_id': user_id
        }

def progress_hook(d, download_id):
    """Update download progress"""
    if d['status'] == 'downloading' and download_id in active_downloads:
        active_downloads[download_id]['progress'] = d.get('_percent_str', '0%')
        active_downloads[download_id]['speed'] = d.get('_speed_str', 'N/A')

def search_youtube_api(query, max_results=10):
    """Search YouTube using official API if key is available"""
    if not YT_API_KEY:
        return None
    
    try:
        url = f'https://www.googleapis.com/youtube/v3/search'
        params = {
            'part': 'snippet',
            'q': query,
            'maxResults': max_results,
            'type': 'video',
            'key': YT_API_KEY
        }
        
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        results = []
        for item in data.get('items', []):
            results.append({
                'id': item['id']['videoId'],
                'title': item['snippet']['title'],
                'description': item['snippet']['description'],
                'thumbnail': item['snippet']['thumbnails']['high']['url'],
                'channel': item['snippet']['channelTitle'],
                'published': item['snippet']['publishedAt']
            })
        
        return results
    except Exception as e:
        print(f"YouTube API search error: {e}")
        return None

def search_youtube_direct(query, max_results=10):
    """Search YouTube using yt-dlp"""
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'force_generic_extractor': False,
        }
        
        search_url = f"ytsearch{max_results}:{query}"
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(search_url, download=False)
            
            results = []
            for entry in info.get('entries', []):
                results.append({
                    'id': entry.get('id'),
                    'title': entry.get('title', 'Unknown'),
                    'duration': entry.get('duration', 0),
                    'thumbnail': entry.get('thumbnail', ''),
                    'uploader': entry.get('uploader', 'Unknown'),
                    'url': entry.get('url') or f"https://youtube.com/watch?v={entry.get('id')}",
                    'view_count': entry.get('view_count', 0)
                })
            
            return results
    except Exception as e:
        print(f"YouTube direct search error: {e}")
        return []

def cleanup_temp_files():
    """Clean up temporary files on exit"""
    for download_id, data in list(active_downloads.items()):
        if 'temp_file' in data and os.path.exists(data['temp_file']):
            try:
                os.remove(data['temp_file'])
            except:
                pass

atexit.register(cleanup_temp_files)

# Route handlers
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/search', methods=['GET'])
def search():
    """Search for YouTube videos"""
    query = request.args.get('q', '').strip()
    if not query or len(query) < 2:
        return jsonify({'error': 'Query must be at least 2 characters'}), 400
    
    # Check cache
    cache_key = hashlib.md5(query.lower().encode()).hexdigest()
    if cache_key in search_cache:
        cached_time, results = search_cache[cache_key]
        if time.time() - cached_time < MAX_CACHE_AGE:
            return jsonify({'results': results})
    
    # Try YouTube API first
    results = search_youtube_api(query)
    
    # Fallback to direct search
    if not results:
        results = search_youtube_direct(query)
    
    if results:
        search_cache[cache_key] = (time.time(), results)
    
    return jsonify({'results': results or []})

@app.route('/api/playlist', methods=['GET', 'POST', 'DELETE'])
def manage_playlist():
    """Manage user playlist"""
    user_id = get_user_session()
    playlist = user_playlists[user_id]
    
    if request.method == 'GET':
        # Get current playlist
        return jsonify({
            'tracks': playlist['tracks'],
            'current_index': playlist['current_index'],
            'history': playlist['history']
        })
    
    elif request.method == 'POST':
        # Add track to playlist
        data = request.json
        track = {
            'id': data.get('id'),
            'title': data.get('title', 'Unknown'),
            'duration': data.get('duration', 0),
            'thumbnail': data.get('thumbnail', ''),
            'uploader': data.get('uploader', 'Unknown'),
            'url': data.get('url'),
            'added_at': time.time()
        }
        
        # Check if already in playlist
        for i, t in enumerate(playlist['tracks']):
            if t.get('id') == track['id']:
                return jsonify({
                    'success': False,
                    'message': 'Track already in playlist',
                    'index': i
                })
        
        playlist['tracks'].append(track)
        return jsonify({
            'success': True,
            'message': 'Track added to playlist',
            'playlist_length': len(playlist['tracks'])
        })
    
    elif request.method == 'DELETE':
        # Remove track from playlist
        data = request.json
        track_id = data.get('track_id')
        
        for i, track in enumerate(playlist['tracks']):
            if track.get('id') == track_id:
                removed_track = playlist['tracks'].pop(i)
                
                # Adjust current index if needed
                if i < playlist['current_index']:
                    playlist['current_index'] -= 1
                elif i == playlist['current_index']:
                    playlist['current_index'] = max(0, min(playlist['current_index'], len(playlist['tracks']) - 1))
                
                return jsonify({
                    'success': True,
                    'message': 'Track removed',
                    'removed_track': removed_track
                })
        
        return jsonify({'success': False, 'message': 'Track not found'}), 404

@app.route('/api/playlist/current', methods=['POST'])
def set_current_track():
    """Set current track in playlist"""
    user_id = get_user_session()
    playlist = user_playlists[user_id]
    
    data = request.json
    track_id = data.get('track_id')
    
    # Find track in playlist
    for i, track in enumerate(playlist['tracks']):
        if track.get('id') == track_id:
            playlist['current_index'] = i
            
            # Add to history
            history_entry = {
                'track_id': track_id,
                'title': track['title'],
                'played_at': time.time()
            }
            playlist['history'].insert(0, history_entry)
            
            # Keep only last 50 history entries
            if len(playlist['history']) > 50:
                playlist['history'] = playlist['history'][:50]
            
            return jsonify({
                'success': True,
                'current_index': i,
                'track': track
            })
    
    return jsonify({'success': False, 'message': 'Track not found'}), 404

@app.route('/api/playlist/next', methods=['POST'])
def next_track():
    """Move to next track in playlist"""
    user_id = get_user_session()
    playlist = user_playlists[user_id]
    
    if not playlist['tracks']:
        return jsonify({'success': False, 'message': 'Playlist is empty'})
    
    # Get next track (loop to beginning if at end)
    playlist['current_index'] = (playlist['current_index'] + 1) % len(playlist['tracks'])
    
    current_track = playlist['tracks'][playlist['current_index']]
    
    # Add to history
    history_entry = {
        'track_id': current_track['id'],
        'title': current_track['title'],
        'played_at': time.time()
    }
    playlist['history'].insert(0, history_entry)
    
    # Keep only last 50 history entries
    if len(playlist['history']) > 50:
        playlist['history'] = playlist['history'][:50]
    
    return jsonify({
        'success': True,
        'current_index': playlist['current_index'],
        'track': current_track
    })

@app.route('/api/playlist/prev', methods=['POST'])
def prev_track():
    """Move to previous track in playlist"""
    user_id = get_user_session()
    playlist = user_playlists[user_id]
    
    if not playlist['tracks']:
        return jsonify({'success': False, 'message': 'Playlist is empty'})
    
    # Get previous track (loop to end if at beginning)
    playlist['current_index'] = (playlist['current_index'] - 1) % len(playlist['tracks'])
    
    current_track = playlist['tracks'][playlist['current_index']]
    
    # Add to history
    history_entry = {
        'track_id': current_track['id'],
        'title': current_track['title'],
        'played_at': time.time()
    }
    playlist['history'].insert(0, history_entry)
    
    # Keep only last 50 history entries
    if len(playlist['history']) > 50:
        playlist['history'] = playlist['history'][:50]
    
    return jsonify({
        'success': True,
        'current_index': playlist['current_index'],
        'track': current_track
    })

@app.route('/api/playlist/clear', methods=['POST'])
def clear_playlist():
    """Clear user playlist"""
    user_id = get_user_session()
    user_playlists[user_id] = {
        'tracks': [],
        'current_index': 0,
        'history': []
    }
    return jsonify({'success': True, 'message': 'Playlist cleared'})

@app.route('/api/info', methods=['POST'])
def get_video_info():
    """Get video information"""
    data = request.json
    url = data.get('url', '')
    video_id = data.get('video_id', '')
    
    if not url and not video_id:
        return jsonify({'error': 'URL or video ID is required'}), 400
    
    if video_id and not url:
        url = f"https://youtube.com/watch?v={video_id}"
    
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            return jsonify({
                'id': info.get('id'),
                'title': info.get('title', 'Unknown'),
                'duration': info.get('duration', 0),
                'thumbnail': info.get('thumbnail', ''),
                'uploader': info.get('uploader', 'Unknown'),
                'url': url,
                'description': info.get('description', '')[:200] + '...' if info.get('description') else ''
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['POST'])
def download_audio():
    """Start audio download"""
    user_id = get_user_session()
    data = request.json
    url = data.get('url', '')
    video_id = data.get('video_id', '')
    
    if not url and video_id:
        url = f"https://youtube.com/watch?v={video_id}"
    
    if not url:
        return jsonify({'error': 'URL is required'}), 400
    
    # Generate unique download ID
    download_id = f"dl_{int(time.time())}_{os.urandom(4).hex()}"
    
    # Initialize download info
    active_downloads[download_id] = {
        'status': 'queued',
        'url': url,
        'user_id': user_id
    }
    
    # Start download in background thread
    thread = threading.Thread(
        target=download_audio_task,
        args=(url, download_id, user_id)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'download_id': download_id,
        'status': 'queued'
    })

@app.route('/api/status/<download_id>', methods=['GET'])
def get_download_status(download_id):
    """Check download status"""
    if download_id not in active_downloads:
        return jsonify({'error': 'Download not found'}), 404
    
    status_data = active_downloads[download_id].copy()
    
    # Remove temp file path from response
    if 'temp_file' in status_data:
        status_data.pop('temp_file')
    
    return jsonify(status_data)

@app.route('/api/stream/<download_id>', methods=['GET'])
def stream_audio(download_id):
    """Stream downloaded audio"""
    if download_id not in active_downloads:
        return jsonify({'error': 'Download not found'}), 404
    
    download_data = active_downloads[download_id]
    
    if download_data['status'] != 'completed':
        return jsonify({'error': 'Download not complete'}), 400
    
    temp_file = download_data.get('temp_file')
    
    if not temp_file or not os.path.exists(temp_file):
        return jsonify({'error': 'Audio file not found'}), 404
    
    # Stream the file
    return send_file(
        temp_file,
        mimetype='audio/mpeg',
        as_attachment=False,
        download_name=f"{download_data.get('title', 'audio')}.mp3"
    )

@app.route('/api/cleanup', methods=['POST'])
def cleanup_download():
    """Clean up completed download"""
    user_id = get_user_session()
    data = request.json
    download_id = data.get('download_id', '')
    
    if download_id in active_downloads:
        # Only allow user to cleanup their own downloads
        if active_downloads[download_id].get('user_id') == user_id:
            download_data = active_downloads.pop(download_id)
            
            # Delete temp file if it exists
            if 'temp_file' in download_data and os.path.exists(download_data['temp_file']):
                try:
                    os.remove(download_data['temp_file'])
                except:
                    pass
    
    return jsonify({'success': True})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
