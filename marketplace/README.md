# MAMU Marketplace

The marketplace uses the app's MongoDB connection and JWT authentication. Seller applications, approval, product listings, and public product browsing are included.

## Product media on Vercel

Create a Vercel Blob store from the Vercel project dashboard under **Storage**, connect it to this project, and redeploy. Vercel supplies `BLOB_READ_WRITE_TOKEN` to the project. The browser then uploads product photos and videos directly to Blob; the API issues a short-lived, seller-scoped upload token and stores the resulting public URL with the product. Vercel's function body-size limit is bypassed for media uploads.

The Blob store must be public because listed marketplace photos and videos are public product media. Keep `BLOB_READ_WRITE_TOKEN` private and out of source control.

For local development, media continues to use the local `frontend/uploads/marketplace` directory unless a Blob token is configured.

## Remaining marketplace work

Payments, order handling, seller settlement, in-app messaging, delivery pricing, and advertising still require implementation and provider configuration before launch.
