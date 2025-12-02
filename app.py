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
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-123')
app.config['SESSION_TYPE'] = 'filesystem'

# In-memory storage
active_downloads = {}
user_playlists = {}
search_cache = {}

# USER AGENTS for anti-bot
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
]

def get_user_session():
    """Get or create user session ID"""
    if 'user_id' not in session:
        session['user_id'] = hashlib.md5(str(time.time()).encode()).hexdigest()[:8]
    return session['user_id']

def get_ydl_opts():
    """Get yt-dlp options"""
    import random
    user_agent = random.choice(USER_AGENTS)
    
    return {
        'format': 'bestaudio/best',
        'outtmpl': '%(title)s.%(ext)s',
        'quiet': True,
        'no_warnings': True,
        'extractaudio': True,
        'audioformat': 'mp3',
        'noplaylist': True,
        'user_agent': user_agent,
        'referer': 'https://www.youtube.com/',
        'socket_timeout': 30,
        'retries': 10,
        'fragment_retries': 10,
        'ignoreerrors': True,
        'no_check_certificate': True,
        'http_headers': {
            'User-Agent': user_agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
        },
    }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/search', methods=['GET'])
def search():
    """Search for YouTube videos"""
    query = request.args.get('q', '').strip()
    if not query or len(query) < 2:
        return jsonify({'error': 'Query must be at least 2 characters'}), 400
    
    try:
        ydl_opts = get_ydl_opts()
        search_url = f"ytsearch10:{query}"
        
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
                })
            
            return jsonify({'results': results})
    except Exception as e:
        print(f"Search error: {e}")
        return jsonify({'results': []})

@app.route('/api/playlist', methods=['GET'])
def get_playlist():
    """Get user playlist"""
    user_id = get_user_session()
    if user_id not in user_playlists:
        user_playlists[user_id] = {
            'tracks': [],
            'current_index': 0,
            'history': []
        }
    
    return jsonify({
        'tracks': user_playlists[user_id]['tracks'],
        'current_index': user_playlists[user_id]['current_index'],
        'history': user_playlists[user_id]['history']
    })

@app.route('/api/playlist', methods=['POST'])
def add_to_playlist():
    """Add track to playlist"""
    user_id = get_user_session()
    if user_id not in user_playlists:
        user_playlists[user_id] = {
            'tracks': [],
            'current_index': 0,
            'history': []
        }
    
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
    
    user_playlists[user_id]['tracks'].append(track)
    return jsonify({'success': True, 'message': 'Track added'})

@app.route('/api/info', methods=['POST'])
def get_video_info():
    """Get video information"""
    data = request.json
    url = data.get('url', '')
    
    if not url:
        return jsonify({'error': 'URL is required'}), 400
    
    try:
        ydl_opts = get_ydl_opts()
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            return jsonify({
                'id': info.get('id'),
                'title': info.get('title', 'Unknown'),
                'duration': info.get('duration', 0),
                'thumbnail': info.get('thumbnail', ''),
                'uploader': info.get('uploader', 'Unknown'),
                'url': url,
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['POST'])
def download_audio():
    """Start audio download"""
    user_id = get_user_session()
    data = request.json
    url = data.get('url', '')
    
    if not url:
        return jsonify({'error': 'URL is required'}), 400
    
    # Generate download ID
    download_id = f"dl_{int(time.time())}_{os.urandom(4).hex()}"
    
    # Store download info
    active_downloads[download_id] = {
        'status': 'queued',
        'url': url,
        'user_id': user_id
    }
    
    # Start download in background
    thread = threading.Thread(
        target=download_task,
        args=(url, download_id, user_id)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'download_id': download_id,
        'status': 'queued'
    })

def download_task(url, download_id, user_id):
    """Background download task"""
    try:
        ydl_opts = get_ydl_opts()
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Create temp file
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
            temp_file.close()
            
            # Download audio
            ydl_opts['outtmpl'] = temp_file.name.replace('.mp3', '')
            with yt_dlp.YoutubeDL(ydl_opts) as ydl2:
                ydl2.download([url])
            
            # Update status
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

@app.route('/api/status/<download_id>', methods=['GET'])
def get_download_status(download_id):
    """Check download status"""
    if download_id not in active_downloads:
        return jsonify({'error': 'Download not found'}), 404
    
    return jsonify(active_downloads[download_id])

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
    
    return send_file(
        temp_file,
        mimetype='audio/mpeg',
        as_attachment=False,
        download_name=f"{download_data.get('title', 'audio')}.mp3"
    )

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Flask server on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)
