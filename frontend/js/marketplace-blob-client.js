import { upload } from "@vercel/blob/client";

window.uploadMarketplaceBlob = async (file, sellerId, onProgress) => {
  const safeName = String(file.name || "product-media").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
  const blob = await upload(`marketplace/${sellerId}/${safeName}`, file, {
    access: "public",
    handleUploadUrl: "/api/marketplace/product-images",
    clientPayload: JSON.stringify({ sellerId }),
    contentType: file.type,
    multipart: file.size > 4 * 1024 * 1024,
    onUploadProgress: onProgress ? (event) => onProgress(event.percentage) : undefined,
  });
  return blob.url;
};
