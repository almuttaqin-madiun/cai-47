import { supabase } from "./supabase";

/**
 * Compress an image file to max 800px and ~0.8 JPEG quality
 * Returns both optimized Blob/File and base64 data URL
 */
export async function compressImage(file: File, maxDimension = 800, quality = 0.8): Promise<{ file: File; dataUrl: string }> {
  return new Promise((resolve) => {
    // If not an image, return original
    if (!file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => resolve({ file, dataUrl: (reader.result as string) || "" });
      reader.onerror = () => resolve({ file, dataUrl: "" });
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
        }

        const dataUrl = canvas.toDataURL("image/jpeg", quality);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve({ file: compressedFile, dataUrl });
            } else {
              resolve({ file, dataUrl });
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => {
        resolve({ file, dataUrl: (e.target?.result as string) || "" });
      };
      img.src = (e.target?.result as string) || "";
    };
    reader.onerror = () => resolve({ file, dataUrl: "" });
    reader.readAsDataURL(file);
  });
}

/**
 * Upload participant avatar photo to Supabase Storage Bucket 'CAI 2026'
 * Folder: 'Foto Profil'
 * @param rawFile - File object from input[type=file]
 * @param identifier - Unique name or ID to generate safe filename
 * @returns Public URL or optimized data URL of the uploaded image
 */
export async function uploadFotoPeserta(
  rawFile: File,
  identifier: string | number
): Promise<string> {
  const timestamp = Date.now();
  const cleanIdentifier = String(identifier)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_") || "peserta";

  // 1. Compress image for high performance & reliability
  let uploadFile = rawFile;
  let fallbackDataUrl = "";
  try {
    const compressed = await compressImage(rawFile, 800, 0.82);
    uploadFile = compressed.file;
    fallbackDataUrl = compressed.dataUrl;
  } catch (compErr) {
    console.warn("[Storage] Compression error, using original file:", compErr);
  }

  const fileName = `Foto Profil/${cleanIdentifier}_${timestamp}.jpg`;
  console.log(`[Storage] Uploading photo "${fileName}" to bucket "CAI 2026"...`);

  // Target bucket names in priority order
  const bucketCandidates = ["CAI 2026", "cai-2026", "cai2026", "avatars", "peserta"];
  let uploadedPath = "";
  let successfulBucket = "";
  let lastError: any = null;

  for (const bucket of bucketCandidates) {
    try {
      // 1. Try uploading to 'Foto Profil/...'
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, uploadFile, {
          contentType: "image/jpeg",
          cacheControl: "3600",
          upsert: true,
        });

      if (!error && data?.path) {
        uploadedPath = data.path;
        successfulBucket = bucket;
        console.log(`[Storage] Successfully uploaded to ${bucket}/${uploadedPath}`);
        break;
      }

      if (error) {
        lastError = error;
        console.warn(`[Storage] Upload to ${bucket}/${fileName} returned:`, error.message);

        // 2. Try root folder if folder path failed
        const rootFileName = `${cleanIdentifier}_${timestamp}.jpg`;
        const { data: rootData, error: rootErr } = await supabase.storage
          .from(bucket)
          .upload(rootFileName, uploadFile, {
            contentType: "image/jpeg",
            cacheControl: "3600",
            upsert: true,
          });

        if (!rootErr && rootData?.path) {
          uploadedPath = rootData.path;
          successfulBucket = bucket;
          console.log(`[Storage] Successfully uploaded to root of ${bucket}/${uploadedPath}`);
          break;
        }
      }
    } catch (err) {
      console.warn(`[Storage] Exception uploading to ${bucket}:`, err);
      lastError = err;
    }
  }

  // If storage upload succeeded, generate public URL
  if (uploadedPath && successfulBucket) {
    const { data: publicUrlData } = supabase.storage
      .from(successfulBucket)
      .getPublicUrl(uploadedPath);

    if (publicUrlData?.publicUrl) {
      console.log(`[Storage] Public URL generated: ${publicUrlData.publicUrl}`);
      return publicUrlData.publicUrl;
    }
  }

  // Fallback: If Supabase Storage upload failed (e.g. Storage RLS policy not set yet),
  // return compressed base64 Data URL so the photo is NEVER lost and immediately saved to 'peserta.foto'!
  console.warn(
    "[Storage] Supabase Storage upload failed or restricted by RLS. Saving compressed photo directly to database 'foto' column.",
    lastError?.message || lastError
  );

  if (fallbackDataUrl) {
    return fallbackDataUrl;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(rawFile);
  });
}
