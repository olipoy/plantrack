// Video compression utilities for client-side optimization

export interface CompressionOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  maxSizeMB: number;
}

export const defaultCompressionOptions: CompressionOptions = {
  maxWidth: 640,
  maxHeight: 480,
  quality: 0.7,
  maxSizeMB: 20 // Keep under 20MB to have buffer for 25MB limit
};

/**
 * Compress video blob using canvas and MediaRecorder
 */
export const compressVideoBlob = async (
  videoBlob: Blob,
  options: CompressionOptions = defaultCompressionOptions
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    video.onloadedmetadata = () => {
      // Calculate new dimensions maintaining aspect ratio
      const { width, height } = calculateOptimalDimensions(
        video.videoWidth,
        video.videoHeight,
        options.maxWidth,
        options.maxHeight
      );

      canvas.width = width;
      canvas.height = height;

      // Set up MediaRecorder for compression
      const stream = canvas.captureStream(15); // 15 fps
      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: calculateBitrate(width, height),
        audioBitsPerSecond: 64000
      });

      const chunks: BlobPart[] = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const compressedBlob = new Blob(chunks, { type: 'video/webm' });
        resolve(compressedBlob);
      };

      recorder.onerror = (e) => {
        reject(new Error('Compression failed: ' + e.error));
      };

      // Start recording
      recorder.start();

      // Draw video frames to canvas
      let frameCount = 0;
      const maxFrames = Math.floor(video.duration * 15); // 15 fps target

      const drawFrame = () => {
        if (frameCount >= maxFrames) {
          recorder.stop();
          return;
        }

        ctx.drawImage(video, 0, 0, width, height);
        frameCount++;
        
        // Continue to next frame
        video.currentTime = frameCount / 15;
      };

      video.onseeked = drawFrame;
      video.currentTime = 0;
    };

    video.onerror = () => {
      reject(new Error('Video loading failed'));
    };

    video.src = URL.createObjectURL(videoBlob);
    video.load();
  });
};

/**
 * Calculate optimal dimensions maintaining aspect ratio
 */
const calculateOptimalDimensions = (
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } => {
  const aspectRatio = originalWidth / originalHeight;
  
  let width = originalWidth;
  let height = originalHeight;

  // Scale down if too large
  if (width > maxWidth) {
    width = maxWidth;
    height = width / aspectRatio;
  }

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  // Ensure even numbers for video encoding
  width = Math.floor(width / 2) * 2;
  height = Math.floor(height / 2) * 2;

  return { width, height };
};

/**
 * Calculate appropriate bitrate based on resolution
 */
const calculateBitrate = (width: number, height: number): number => {
  const pixels = width * height;
  
  // Base bitrate calculation: ~0.1 bits per pixel per frame at 15fps
  const baseBitrate = pixels * 0.1 * 15;
  
  // Clamp between reasonable limits
  return Math.max(200000, Math.min(800000, baseBitrate));
};

/**
 * Check if blob exceeds size limit and compress if needed
 */
export const ensureSizeLimit = async (
  blob: Blob,
  maxSizeMB: number = 20
): Promise<Blob> => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  if (blob.size <= maxSizeBytes) {
    return blob;
  }

  console.log(`Video too large (${(blob.size / 1024 / 1024).toFixed(1)}MB), compressing...`);
  
  // Progressive compression with lower quality
  let quality = 0.7;
  let compressedBlob = blob;
  
  while (compressedBlob.size > maxSizeBytes && quality > 0.3) {
    try {
      compressedBlob = await compressVideoBlob(blob, {
        ...defaultCompressionOptions,
        quality,
        maxWidth: quality > 0.5 ? 640 : 480,
        maxHeight: quality > 0.5 ? 480 : 360
      });
      
      console.log(`Compressed to ${(compressedBlob.size / 1024 / 1024).toFixed(1)}MB with quality ${quality}`);
      
      if (compressedBlob.size <= maxSizeBytes) {
        break;
      }
      
      quality -= 0.1;
    } catch (error) {
      console.error('Compression failed:', error);
      break;
    }
  }
  
  return compressedBlob;
};

/**
 * Get video duration from blob
 */
export const getVideoDuration = (blob: Blob): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    
    video.onloadedmetadata = () => {
      resolve(video.duration);
      URL.revokeObjectURL(video.src);
    };
    
    video.onerror = () => {
      reject(new Error('Failed to load video metadata'));
      URL.revokeObjectURL(video.src);
    };
    
    video.src = URL.createObjectURL(blob);
  });
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};