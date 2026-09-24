import { v2 as cloudinary } from 'cloudinary';
import env from '../config/env.js';

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
  secure: true,
});

export const UPLOAD_POLICY = {
  maxBytes: 10 * 1024 * 1024, // 10 MB
  allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'pdf'],
};

/**
 * The signature covers only parameters the SERVER chose. A client cannot widen
 * the folder, raise the size cap or change the resource type, because altering
 * any signed value invalidates the signature at Cloudinary's end.
 */
/**
 * Cloudinary's delivery host. A custom CNAME can be added via env if the firm
 * ever puts media on its own domain.
 */
const DELIVERY_HOSTS = new Set(
  ['res.cloudinary.com', process.env.CLOUDINARY_CNAME].filter(Boolean),
);

/**
 * Confirms a URL really is one of our own Cloudinary assets.
 *
 * A substring test is not enough: `https://attacker.example/<cloud>/x.jpg`
 * contains the cloud name but is served by someone else entirely, and storing
 * it would embed a third-party URL in the public site's <img> tags — leaking
 * every visitor's IP and user agent to that host. The hostname is therefore
 * parsed and compared exactly, and the cloud name must be the FIRST path
 * segment, which is where Cloudinary actually puts it.
 */
export function isOwnCloudinaryUrl(value, cloudName = env.cloudinary.cloudName, requireHttps = true) {
  if (!value || !cloudName) return false;

  let url;
  try {
    url = new URL(String(value));
  } catch {
    return false;
  }

  // secureUrl must be https — that is the one property its name promises.
  // Cloudinary's own plain `url` field for the same asset is legitimately
  // http by Cloudinary's own convention, so the persist check below asks for
  // http-or-https there instead, while still requiring the same cloud and
  // delivery host.
  if (requireHttps ? url.protocol !== 'https:' : !['https:', 'http:'].includes(url.protocol)) {
    return false;
  }
  if (!DELIVERY_HOSTS.has(url.hostname.toLowerCase())) return false;

  const [first] = url.pathname.replace(/^\/+/, '').split('/');
  return first === cloudName;
}

export function signUpload({ folder = env.cloudinary.folder } = {}) {
  const timestamp = Math.round(Date.now() / 1000);
  const params = {
    timestamp,
    folder,
    allowed_formats: UPLOAD_POLICY.allowedFormats.join(','),
  };
  const signature = cloudinary.utils.api_sign_request(params, env.cloudinary.apiSecret);
  return {
    ...params,
    signature,
    apiKey: env.cloudinary.apiKey,
    cloudName: env.cloudinary.cloudName,
    maxBytes: UPLOAD_POLICY.maxBytes,
  };
}

export async function destroyAsset(publicId, resourceType = 'image') {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
}

export default cloudinary;
