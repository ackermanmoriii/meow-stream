import os
import re
from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import yt_dlp
import threading
import queue
import tempfile
import atexit
import time

app = Flask(__name__)
CORS(app)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size
app.config['SECRET_KEY'] = os.urandom(24)

# In-memory storage for active downloads (in production use Redis or database)
download_queue = queue.Queue()
active_downloads = {}

# Cleanup function for temp files
def cleanup_temp_files():
    for download_id, data in list(active_downloads.items()):
        if 'temp_file' in data and os.path.exists(data['temp_file']):
            try:
                os.remove(data['temp_file'])
            except:
                pass

atexit.register(cleanup_temp_files)

def extract_video_id(url):
    """Extract YouTube video ID from URL"""
    patterns = [
        r'(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+)',
        r'(?:youtu\.be\/)([a-zA-Z0-9_-]+)',
        r'(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]+)'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def download_audio_task(video_url, download_id):
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
                'thumbnail': info.get('thumbnail', '')
            }
            
    except Exception as e:
        active_downloads[download_id] = {
            'status': 'error',
            'error': str(e)
        }

def progress_hook(d, download_id):
    """Update download progress"""
    if d['status'] == 'downloading':
        if download_id in active_downloads:
            active_downloads[download_id]['progress'] = d.get('_percent_str', '0%')
            active_downloads[download_id]['speed'] = d.get('_speed_str', 'N/A')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/info', methods=['POST'])
def get_video_info():
    """Get video information without downloading"""
    data = request.json
    url = data.get('url', '')
    
    if not url:
        return jsonify({'error': 'URL is required'}), 400
    
    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({'error': 'Invalid YouTube URL'}), 400
    
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            return jsonify({
                'title': info.get('title', 'Unknown'),
                'duration': info.get('duration', 0),
                'thumbnail': info.get('thumbnail', ''),
                'video_id': video_id,
                'formats': [f for f in info.get('formats', []) if f.get('acodec') != 'none']
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['POST'])
def download_audio():
    """Start audio download"""
    data = request.json
    url = data.get('url', '')
    format_id = data.get('format_id', 'best')
    
    if not url:
        return jsonify({'error': 'URL is required'}), 400
    
    # Generate unique download ID
    download_id = f"dl_{int(time.time())}_{os.urandom(4).hex()}"
    
    # Initialize download info
    active_downloads[download_id] = {
        'status': 'queued',
        'url': url
    }
    
    # Start download in background thread
    thread = threading.Thread(
        target=download_audio_task,
        args=(url, download_id)
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
    data = request.json
    download_id = data.get('download_id', '')
    
    if download_id in active_downloads:
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
