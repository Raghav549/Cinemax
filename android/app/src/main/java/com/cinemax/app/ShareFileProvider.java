package com.cinemax.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Hands the files attached to a share to whichever app the visitor picks.
 *
 * Android 7 and later forbid an app from handing a {@code file://} URI to
 * another app ({@link android.os.FileUriExposedException}), so the shared image
 * and trailer are exposed as {@code content://} URIs instead. This provider is
 * the smallest thing that can do that without the AndroidX FileProvider library
 * (this build links against the platform SDK only):
 *
 *  · it reads from one directory only — {@code <cache>/share} — and resolves
 *    every request to a canonical path inside it, so a crafted name can never
 *    reach the rest of the app's storage;
 *  · it is not exported, so only apps that have been granted a URI permission
 *    (the share chooser) can read from it;
 *  · it exposes nothing but read access.
 */
public class ShareFileProvider extends ContentProvider {

    /** Authority declared in AndroidManifest.xml. */
    public static final String AUTHORITY = "com.cinemax.app.share.files";

    /** Directory under the app cache that holds shareable files. */
    static final String DIRECTORY = "share";

    static File directory(Context context) {
        File dir = new File(context.getCacheDir(), DIRECTORY);
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return dir;
    }

    /** The content URI the share sheet receives for a downloaded file. */
    public static Uri contentUri(File file) {
        return new Uri.Builder()
                .scheme("content")
                .authority(AUTHORITY)
                .appendPath(file.getName())
                .build();
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        String name = nameOf(uri);
        int dot = name.lastIndexOf('.');
        String extension = dot >= 0 ? name.substring(dot + 1).toLowerCase() : "";
        if ("mp4".equals(extension)) {
            return "video/mp4";
        }
        if ("webm".equals(extension)) {
            return "video/webm";
        }
        if ("m4v".equals(extension)) {
            return "video/x-m4v";
        }
        String guessed = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        return guessed != null ? guessed : "application/octet-stream";
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (mode != null && mode.contains("w")) {
            throw new FileNotFoundException("Share exports are read-only");
        }
        File file = resolve(uri);
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File file = resolveQuietly(uri);
        if (file == null) {
            return null;
        }
        String[] columns = projection != null ? projection
                : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor cursor = new MatrixCursor(columns, 1);
        Object[] row = new Object[columns.length];
        for (int index = 0; index < columns.length; index++) {
            if (OpenableColumns.DISPLAY_NAME.equals(columns[index])) {
                row[index] = file.getName();
            } else if (OpenableColumns.SIZE.equals(columns[index])) {
                row[index] = file.length();
            } else {
                row[index] = null;
            }
        }
        cursor.addRow(row);
        return cursor;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("Share exports are read-only");
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("Share exports are read-only");
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("Share exports are read-only");
    }

    /** The requested file, guaranteed to sit inside the share directory. */
    private File resolve(Uri uri) throws FileNotFoundException {
        File file = resolveQuietly(uri);
        if (file == null) {
            throw new FileNotFoundException("Not a share export: " + uri);
        }
        return file;
    }

    private File resolveQuietly(Uri uri) {
        if (uri == null || getContext() == null) {
            return null;
        }
        String name = nameOf(uri);
        if (name.isEmpty()) {
            return null;
        }
        try {
            File dir = directory(getContext()).getCanonicalFile();
            File candidate = new File(dir, name).getCanonicalFile();
            if (!candidate.getParentFile().equals(dir) || !candidate.isFile()) {
                return null;
            }
            return candidate;
        } catch (Exception invalid) {
            return null;
        }
    }

    /** Last path segment, without any encoded separators. */
    private static String nameOf(Uri uri) {
        String name = uri.getLastPathSegment();
        if (name == null) {
            return "";
        }
        name = name.replace("/", "").replace("\\", "").trim();
        return name;
    }
}
