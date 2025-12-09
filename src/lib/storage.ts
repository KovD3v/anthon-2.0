/**
 * Storage Utilities
 *
 * Core storage logic for uploading files to Vercel Blob.
 * Extracted for reuse across API routes (chat upload, WhatsApp webhook, etc.)
 */

import { put, del } from "@vercel/blob";

// Max file size: 10MB
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file types
export const ALLOWED_TYPES = [
	// Images
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
	"image/svg+xml",
	"image/bmp",
	// Documents
	"application/pdf",
	"text/plain",
	"text/markdown",
	"text/csv",
	// Office
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"application/msword",
	"application/vnd.ms-excel",
	"application/vnd.ms-powerpoint",
	// Code
	"application/json",
	"text/javascript",
	"text/typescript",
	"text/html",
	"text/css",
	"application/xml",
	"text/xml",
	// Archives
	"application/zip",
	"application/x-rar-compressed",
	"application/x-7z-compressed",
	// Audio
	"audio/mpeg",
	"audio/wav",
	"audio/ogg",
	// Video
	"video/mp4",
	"video/mpeg",
	"video/webm",
] as const;

/**
 * Detect file type from extension if MIME type is not available
 */
export function detectFileType(filename: string): string {
	const ext = filename.split(".").pop()?.toLowerCase();

	const typeMap: Record<string, string> = {
		// Images
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		gif: "image/gif",
		webp: "image/webp",
		svg: "image/svg+xml",
		// Documents
		pdf: "application/pdf",
		txt: "text/plain",
		md: "text/markdown",
		csv: "text/csv",
		// Office
		docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		// Code
		json: "application/json",
		js: "text/javascript",
		ts: "text/typescript",
		html: "text/html",
		css: "text/css",
		xml: "application/xml",
		// Archives
		zip: "application/zip",
		rar: "application/x-rar-compressed",
		"7z": "application/x-7z-compressed",
		// Audio
		mp3: "audio/mpeg",
		wav: "audio/wav",
		ogg: "audio/ogg",
		// Video
		mp4: "video/mp4",
		mpeg: "video/mpeg",
		webm: "video/webm",
	};

	return typeMap[ext || ""] || "application/octet-stream";
}

/**
 * Validate file type against allowed list
 */
export function isAllowedType(mimeType: string): boolean {
	return (ALLOWED_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Upload result returned by uploadToBlob
 */
export interface UploadResult {
	url: string;
	downloadUrl: string;
	size: number;
	contentType: string;
}

/**
 * Upload a file to Vercel Blob storage.
 *
 * @param userId - User ID for organizing uploads
 * @param file - File buffer or Blob to upload
 * @param filename - Original filename
 * @param options - Optional settings
 * @returns Upload result with URL and metadata
 */
export async function uploadToBlob(
	userId: string,
	file: Buffer | Blob,
	filename: string,
	options?: {
		contentType?: string;
		access?: "public" | "private";
	}
): Promise<UploadResult> {
	// Determine content type
	const contentType = options?.contentType || detectFileType(filename);

	// Validate file type
	if (!isAllowedType(contentType)) {
		throw new Error(`File type not allowed: ${contentType}`);
	}

	// Get file size
	const size = file instanceof Buffer ? file.length : (file as Blob).size;

	// Validate file size
	if (size > MAX_FILE_SIZE) {
		throw new Error(
			`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
		);
	}

	// Generate unique path with user folder organization
	const timestamp = Date.now();
	const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
	const path = `uploads/${userId}/${timestamp}-${safeName}`;

	// Upload to Vercel Blob
	const result = await put(path, file, {
		access: "public",
		contentType,
	});

	return {
		url: result.url,
		downloadUrl: result.downloadUrl,
		size,
		contentType,
	};
}

/**
 * Delete a file from Vercel Blob storage.
 *
 * @param blobUrl - The blob URL to delete
 */
export async function deleteFromBlob(blobUrl: string): Promise<void> {
	await del(blobUrl);
}
