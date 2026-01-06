import { useState, useRef } from 'react';
import './AvatarUpload.css';

function AvatarUpload({ value, onChange, size = 80 }) {
  const [showOptions, setShowOptions] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Compress and resize image to avoid huge iPhone photos
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      // First read file as data URL (works better with iPhone HEIC)
      const reader = new FileReader();

      reader.onload = (readerEvent) => {
        const img = new Image();
        let objectUrl = null;

        // Timeout after 10 seconds
        const timeout = setTimeout(() => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          reject(new Error('Image processing timed out'));
        }, 10000);

        img.onload = () => {
          clearTimeout(timeout);
          if (objectUrl) URL.revokeObjectURL(objectUrl);

          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Max size 300x300 for smaller avatars
            const maxSize = 300;
            let width = img.width;
            let height = img.height;

            // Scale down if needed
            if (width > height) {
              if (width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
              }
            } else {
              if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
              }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            // Compress to JPEG at 70% quality for smaller size
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

            // Verify compression worked (should be under 100KB typically)
            console.log('Compressed image size:', Math.round(dataUrl.length / 1024), 'KB');

            resolve(dataUrl);
          } catch (err) {
            reject(err);
          }
        };

        img.onerror = () => {
          clearTimeout(timeout);
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          reject(new Error('Failed to load image'));
        };

        // Use the data URL from FileReader
        img.src = readerEvent.target.result;
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size - warn if over 10MB
    if (file.size > 10 * 1024 * 1024) {
      console.warn('Large file:', Math.round(file.size / 1024 / 1024), 'MB');
    }

    setLoading(true);
    try {
      const compressedDataUrl = await compressImage(file);
      onChange(compressedDataUrl);
      setShowOptions(false);
    } catch (err) {
      console.error('Image compression error:', err);
      alert('Failed to process image: ' + err.message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const startCamera = async () => {
    setShowCamera(true);
    setShowOptions(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 640 }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera error:', err);
      alert('Could not access camera');
      setShowCamera(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    // Center crop to square
    const video = videoRef.current;
    const size = Math.min(video.videoWidth, video.videoHeight);
    const x = (video.videoWidth - size) / 2;
    const y = (video.videoHeight - size) / 2;

    ctx.drawImage(video, x, y, size, size, 0, 0, 400, 400);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

    onChange(dataUrl);
    stopCamera();
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  if (showCamera) {
    return (
      <div className="camera-modal">
        <div className="camera-container">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="camera-preview"
          />
          <div className="camera-actions">
            <button className="capture-btn" onClick={capturePhoto}>
              Take Photo
            </button>
            <button className="cancel-btn" onClick={stopCamera}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="avatar-upload-wrapper">
      <div
        className="avatar-trigger"
        onClick={() => !loading && setShowOptions(!showOptions)}
        style={{ width: size, height: size }}
      >
        {loading ? (
          <div className="avatar-loading">
            <div className="avatar-spinner" />
          </div>
        ) : value ? (
          <img src={value} alt="Avatar" className="avatar-image" />
        ) : (
          <div className="avatar-empty">
            <span>+</span>
            <span>Photo</span>
          </div>
        )}
      </div>

      {showOptions && (
        <div className="avatar-options">
          <button onClick={() => fileInputRef.current?.click()}>
            Choose File
          </button>
          <button onClick={startCamera}>
            Use Camera
          </button>
          {value && (
            <button className="remove-option" onClick={() => { onChange(''); setShowOptions(false); }}>
              Remove
            </button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        hidden
      />
    </div>
  );
}

export default AvatarUpload;
