import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Initialize S3 client
let s3Client = null;
let bucketName = null;

if (process.env.STORAGE_PROVIDER === 's3' && 
    process.env.AWS_ACCESS_KEY_ID && 
    process.env.AWS_SECRET_ACCESS_KEY && 
    process.env.S3_BUCKET) {
  
  s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  
  bucketName = process.env.S3_BUCKET;
  console.log(`Storage provider: s3, bucket: ${bucketName}`);
} else {
  console.log('S3 storage not configured - missing required environment variables');
}

/**
 * Generate a presigned URL for an S3 object
 * @param {string} key - S3 object key
 * @param {number} ttlSeconds - TTL in seconds (default: 1 hour)
 * @returns {Promise<string|null>} - Presigned URL or null if failed
 */
export const presign = async (key, ttlSeconds = 3600) => {
  if (!s3Client || !bucketName || !key) {
    return null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { 
      expiresIn: ttlSeconds 
    });
    
    return url;
  } catch (error) {
    console.error('Failed to generate presigned URL:', error);
    return null;
  }
};

/**
 * Get an object stream from S3
 * @param {string} key - S3 object key
 * @returns {Promise<{stream: ReadableStream, contentType: string}|null>}
 */
export const getObjectStream = async (key) => {
  if (!s3Client || !bucketName || !key) {
    return null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await s3Client.send(command);
    
    return {
      stream: response.Body,
      contentType: response.ContentType || 'application/octet-stream',
    };
  } catch (error) {
    console.error('Failed to get object stream from S3:', error);
    return null;
  }
};

/**
 * Check if S3 is configured and available
 * @returns {boolean}
 */
export const isS3Available = () => {
  return !!(s3Client && bucketName);
};

/**
 * Get the configured bucket name
 * @returns {string|null}
 */
export const getBucketName = () => {
  return bucketName;
};

// Export the S3 client for advanced usage if needed
export { s3Client };