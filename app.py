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
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', os.urandom(24))
app.config['SESSION_TYPE'] = 'filesystem'

# Custom User-Agent headers to avoid bot detection
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]

def get_ydl_opts():
    """Get yt-dlp options with anti-bot measures"""
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
        'progress_hooks': [lambda d: progress_hook(d, download_id)],
        # Anti-bot measures
        'user_agent': user_agent,
        'referer': 'https://www.youtube.com/',
        'socket_timeout': 30,
        'retries': 10,
        'fragment_retries': 10,
        'ignoreerrors': True,
        'no_check_certificate': True,
        'prefer_insecure': False,
        'http_headers': {
            'User-Agent': user_agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        },
    }

def get_info_ydl_opts():
    """Get yt-dlp options for info extraction only"""
    import random
    user_agent = random.choice(USER_AGENTS)
    
    return {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'ignoreerrors': True,
        'no_check_certificate': True,
        'user_agent': user_agent,
        'http_headers': {
            'User-Agent': user_agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        },
    }

def get_search_ydl_opts():
    """Get yt-dlp options for search"""
    import random
    user_agent = random.choice(USER_AGENTS)
    
    return {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True,
        'force_generic_extractor': False,
        'ignoreerrors': True,
        'user_agent': user_agent,
        'http_headers': {
            'User-Agent': user_agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        },
    }

# ... rest of the functions remain the same until download_audio_task ...

def download_audio_task(video_url, download_id, user_id):
    """Background task to download audio from YouTube"""
    try:
        ydl_opts = get_ydl_opts()
        ydl_opts['progress_hooks'] = [lambda d: progress_hook(d, download_id)]
        
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

def search_youtube_direct(query, max_results=10):
    """Search YouTube using yt-dlp"""
    try:
        ydl_opts = get_search_ydl_opts()
        
        search_url = f"ytsearch{max_results}:{query}"
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(search_url, download=False)
            
            results = []
            for entry in info.get('entries', []):
                # Get a valid thumbnail URL or use placeholder
                thumbnail = entry.get('thumbnail', '')
                if not thumbnail or 'http' not in thumbnail:
                    # Use YouTube thumbnail pattern if available
                    if entry.get('id'):
                        thumbnail = f"https://i.ytimg.com/vi/{entry['id']}/hqdefault.jpg"
                    else:
                        thumbnail = ''  # Will be handled by frontend
                
                results.append({
                    'id': entry.get('id'),
                    'title': entry.get('title', 'Unknown'),
                    'duration': entry.get('duration', 0),
                    'thumbnail': thumbnail,
                    'uploader': entry.get('uploader', 'Unknown'),
                    'url': entry.get('url') or f"https://youtube.com/watch?v={entry.get('id')}",
                    'view_count': entry.get('view_count', 0)
                })
            
            return results
    except Exception as e:
        print(f"YouTube direct search error: {e}")
        return []

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
        ydl_opts = get_info_ydl_opts()
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Get valid thumbnail
            thumbnail = info.get('thumbnail', '')
            if not thumbnail or 'http' not in thumbnail:
                video_id = info.get('id')
                if video_id:
                    thumbnail = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
            
            return jsonify({
                'id': info.get('id'),
                'title': info.get('title', 'Unknown'),
                'duration': info.get('duration', 0),
                'thumbnail': thumbnail,
                'uploader': info.get('uploader', 'Unknown'),
                'url': url,
                'description': info.get('description', '')[:200] + '...' if info.get('description') else ''
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ... rest of the code remains the same ...

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
