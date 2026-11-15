<?php

require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}
$admin = requireAdminToken($pdo);
requireAdminPermission($admin, 'products', 'images.upload');

$files = $_FILES['images'] ?? null;
if (!is_array($files) || !isset($files['name']) || !is_array($files['name'])) {
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    $status = $contentLength > 0 ? 413 : 422;
    $message = $status === 413
        ? 'The image upload exceeds the server limit. Choose fewer or smaller photos.'
        : 'Select at least one product image.';
    jsonResponse(['error' => $message], $status);
}

$count = count($files['name']);
if ($count < 1 || $count > 5) {
    jsonResponse(['error' => 'Upload between one and five product images at a time.'], 422);
}

if (!class_exists('finfo')) {
    error_log('Shopademia image upload requires the PHP fileinfo extension');
    jsonResponse(['error' => 'Image upload is unavailable on this server.'], 500);
}

$targetDirectory = __DIR__ . '/../assets/products';
if (!is_dir($targetDirectory) && !mkdir($targetDirectory, 0755, true) && !is_dir($targetDirectory)) {
    error_log('Shopademia could not create the product image directory');
    jsonResponse(['error' => 'Could not prepare product image storage.'], 500);
}
if (!is_writable($targetDirectory)) {
    error_log('Shopademia product image directory is not writable');
    jsonResponse(['error' => 'Product image storage is not writable.'], 500);
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$validFiles = [];
for ($index = 0; $index < $count; $index++) {
    $error = $files['error'][$index] ?? UPLOAD_ERR_NO_FILE;
    if ($error !== UPLOAD_ERR_OK) {
        $status = in_array($error, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 413 : 422;
        jsonResponse(['error' => $status === 413 ? 'An image exceeds the server upload limit. Choose a smaller photo.' : 'One of the selected images could not be uploaded.'], $status);
    }

    $temporaryPath = $files['tmp_name'][$index] ?? '';
    $size = isset($files['size'][$index]) ? (int)$files['size'][$index] : 0;
    if (!is_uploaded_file($temporaryPath) || $size < 1 || $size > 1500000) {
        jsonResponse(['error' => 'Each product image must be smaller than 1.5 MB.'], 413);
    }

    $mimeType = $finfo->file($temporaryPath);
    $imageInfo = getimagesize($temporaryPath);
    $extensionsByMime = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp'
    ];
    if (
        !isset($extensionsByMime[$mimeType])
        || $imageInfo === false
        || ($imageInfo['mime'] ?? '') !== $mimeType
        || ($imageInfo[0] ?? 0) > 6000
        || ($imageInfo[1] ?? 0) > 6000
    ) {
        jsonResponse(['error' => 'Product photos must be valid JPEG, PNG, or WebP images.'], 422);
    }

    $validFiles[] = [
        'path' => $temporaryPath,
        'extension' => $extensionsByMime[$mimeType]
    ];
}

$storedPaths = [];
foreach ($validFiles as $file) {
    try {
        $fileName = bin2hex(random_bytes(16)) . '.' . $file['extension'];
    } catch (Exception $error) {
        error_log('Shopademia could not generate a product image filename: ' . $error->getMessage());
        jsonResponse(['error' => 'Could not safely name the uploaded image.'], 500);
    }

    if (!function_exists('imagecreatefromstring')) {
        error_log('Shopademia image upload requires the PHP GD extension for re-encoding');
        jsonResponse(['error' => 'Image upload is unavailable on this server.'], 500);
    }
    $image = imagecreatefromstring((string)file_get_contents($file['path']));
    if ($image === false) {
        jsonResponse(['error' => 'The uploaded image could not be decoded safely.'], 422);
    }
    $temporaryDestination = tempnam($targetDirectory, 'upload-');
    if ($temporaryDestination === false) {
        imagedestroy($image);
        error_log('Shopademia could not create a temporary image destination');
        jsonResponse(['error' => 'Could not safely process the uploaded image.'], 500);
    }
    $encoded = false;
    if ($file['extension'] === 'jpg') {
        $encoded = imagejpeg($image, $temporaryDestination, 90);
    } elseif ($file['extension'] === 'png') {
        imagealphablending($image, false);
        imagesavealpha($image, true);
        $encoded = imagepng($image, $temporaryDestination, 6);
    } elseif ($file['extension'] === 'webp' && function_exists('imagewebp')) {
        $encoded = imagewebp($image, $temporaryDestination, 88);
    }
    imagedestroy($image);
    $destination = $targetDirectory . DIRECTORY_SEPARATOR . $fileName;
    if (!$encoded || !rename($temporaryDestination, $destination)) {
        if (is_file($temporaryDestination)) {
            unlink($temporaryDestination);
        }
        foreach ($storedPaths as $storedPath) {
            if (!unlink($targetDirectory . DIRECTORY_SEPARATOR . basename($storedPath))) {
                error_log('Shopademia failed to remove a partial product image upload');
            }
        }
        error_log('Shopademia failed to store a product image');
        jsonResponse(['error' => 'Could not store the uploaded product images.'], 500);
    }
    if (!chmod($destination, 0644)) {
        if (!unlink($destination)) {
            error_log('Shopademia failed to remove a product image with unsafe permissions');
        }
        foreach ($storedPaths as $storedPath) {
            if (!unlink($targetDirectory . DIRECTORY_SEPARATOR . basename($storedPath))) {
                error_log('Shopademia failed to remove a partial product image upload');
            }
        }
        error_log('Shopademia could not set public read permissions on a product image');
        jsonResponse(['error' => 'Could not make the uploaded product images publicly readable.'], 500);
    }
    $storedPaths[] = 'assets/products/' . $fileName;
}

jsonResponse(['status' => 'success', 'data' => ['images' => $storedPaths]], 201);
