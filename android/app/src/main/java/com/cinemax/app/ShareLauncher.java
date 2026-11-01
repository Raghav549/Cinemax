package com.cinemax.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Locale;

/**
 * The native share sheet for a title.
 *
 * The page decides *what* a share contains (title, description, link, preview
 * image, trailer file) and this class hands it to Android's own
 * {@code Intent.createChooser}. There is no hardcoded list of apps and no
 * shortcut: the chooser lists whatever is installed, and every entry receives a
 * real {@code ACTION_SEND} intent.
 *
 * The card image is attached as a real file, because a share must carry bytes
 * another app can read — a network URL in EXTRA_STREAM is not a share on
 * Android. It is exposed through {@link ShareFileProvider} as a
 * {@code content://} URI with a read grant, which is the only form Android 7+
 * accepts.
 *
 * The sheet is never made to wait for the network. A card that is already in the
 * cache (from an earlier share of the same title) is attached instantly; a card
 * that still has to be downloaded gets {@link #ATTACH_BUDGET_MS} and then the
 * sheet opens with the text and the link, which the receiving app unfurls into
 * the same CINEMAX card from the page's Open Graph metadata. The download keeps
 * running in the background and is attached on the next share. Before this, the
 * chooser waited for a multi-hundred-kilobyte image (and sometimes a trailer) to
 * arrive, which on a phone network looked exactly like a share button that did
 * nothing.
 */
final class ShareLauncher {

    private static final String THREAD_NAME = "cinemax-share";
    private static final int CONNECT_TIMEOUT_MS = 6000;
    private static final int READ_TIMEOUT_MS = 9000;
    /** Roughly the delivered size of a 1200x630 card. */
    private static final int MAX_IMAGE_BYTES = 6 * 1024 * 1024;
    /** A minute or so of 1080p — larger files stall the chooser instead of sharing. */
    private static final int MAX_VIDEO_BYTES = 24 * 1024 * 1024;
    /** Files from earlier shares are swept once they are older than this. */
    private static final long STALE_EXPORT_MILLIS = 60L * 60L * 1000L;
    /** How long the chooser waits for a not-yet-cached attachment. */
    private static final long ATTACH_BUDGET_MS = 1500L;

    private ShareLauncher() {
    }

    static void share(final Activity activity,
                      final String title,
                      final String text,
                      final String url,
                      final String imageUrl,
                      final String videoUrl) {
        if (activity == null || activity.isFinishing()) {
            return;
        }
        final String subject = clean(title);
        final String body = clean(text);
        final String link = clean(url);

        // Nothing to hand over: open the sheet with the text anyway, rather than
        // doing nothing at all in front of the visitor.
        if (subject.isEmpty() && body.isEmpty() && link.isEmpty()) {
            return;
        }

        Thread worker = new Thread(new Runnable() {
            @Override
            public void run() {
                // Nothing here blocks the page: the bridge call has already
                // returned, and the chooser is opened from this worker.
                File image = downloadWithin(activity, imageUrl, "card", MAX_IMAGE_BYTES, ATTACH_BUDGET_MS);
                File video = downloadWithin(activity, videoUrl, "trailer", MAX_VIDEO_BYTES, Math.max(400L, ATTACH_BUDGET_MS / 2));
                final File imageFile = image;
                final File videoFile = video;
                activity.runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        launch(activity, subject, body, link, imageFile, videoFile);
                    }
                });
            }
        }, THREAD_NAME);
        worker.setDaemon(true);
        worker.start();
    }

    /**
     * Returns the attachment, without ever letting a slow network hold the share
     * sheet: an already-cached file is returned immediately, a fresh download is
     * given `budgetMs` and then abandoned to the background (its bytes stay in
     * the cache for the next share of the same title).
     */
    private static File downloadWithin(final Activity activity, final String address, final String prefix,
                                       final int maxBytes, final long budgetMs) {
        if (!fetchable(address)) {
            return null;
        }
        File cached = cachedAttachment(activity, address);
        if (cached != null) {
            return cached;
        }
        final File[] slot = new File[1];
        Thread fetcher = new Thread(new Runnable() {
            @Override
            public void run() {
                slot[0] = download(activity, address, prefix, maxBytes);
            }
        }, THREAD_NAME + "-fetch");
        fetcher.setDaemon(true);
        fetcher.start();
        try {
            fetcher.join(budgetMs);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
        return slot[0];
    }

    /** A card from an earlier share of this exact URL, if it is still fresh. */
    private static File cachedAttachment(Activity activity, String address) {
        File[] files = ShareFileProvider.directory(activity).listFiles();
        if (files == null) {
            return null;
        }
        String prefix = keyFor(address) + ".";
        long cutoff = System.currentTimeMillis() - STALE_EXPORT_MILLIS;
        for (File file : files) {
            if (file.getName().startsWith(prefix) && file.lastModified() >= cutoff) {
                return file;
            }
        }
        return null;
    }

    /** Stable, filesystem-safe name for one attachment URL. */
    private static String keyFor(String address) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] bytes = digest.digest(address.getBytes("UTF-8"));
            StringBuilder builder = new StringBuilder("asset-");
            for (int i = 0; i < 8; i++) {
                builder.append(String.format(Locale.US, "%02x", bytes[i]));
            }
            return builder.toString();
        } catch (Exception unavailable) {
            return "asset-" + Integer.toHexString(address.hashCode());
        }
    }

    /** Builds the chooser. Runs on the UI thread; the files already exist. */
    private static void launch(Activity activity,
                               String subject,
                               String body,
                               String link,
                               File image,
                               File video) {
        if (activity.isFinishing()) {
            return;
        }

        ArrayList<Uri> streams = new ArrayList<>(2);
        ClipData clip = null;
        if (image != null) {
            Uri uri = ShareFileProvider.contentUri(image);
            streams.add(uri);
            clip = appendClip(clip, image.getName(), uri);
        }
        if (video != null) {
            Uri uri = ShareFileProvider.contentUri(video);
            streams.add(uri);
            clip = appendClip(clip, video.getName(), uri);
        }

        boolean multiple = streams.size() > 1;
        Intent send = new Intent(multiple ? Intent.ACTION_SEND_MULTIPLE : Intent.ACTION_SEND);
        send.setType(mimeType(streams.size(), video != null));

        String message = composeMessage(body, link);
        if (!subject.isEmpty()) {
            send.putExtra(Intent.EXTRA_SUBJECT, subject);
            send.putExtra(Intent.EXTRA_TITLE, subject);
        }
        if (!message.isEmpty()) {
            send.putExtra(Intent.EXTRA_TEXT, message);
        }
        if (multiple) {
            send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, streams);
        } else if (streams.size() == 1) {
            send.putExtra(Intent.EXTRA_STREAM, streams.get(0));
        }
        if (clip != null) {
            // The read grant travels with the clip data, which is what apps that
            // only look at clip data (rather than EXTRA_STREAM) rely on.
            send.setClipData(clip);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }

        Intent chooser = Intent.createChooser(send, activity.getString(R.string.share_chooser_title));
        try {
            activity.startActivity(chooser);
        } catch (ActivityNotFoundException missing) {
            Toast.makeText(activity, R.string.share_unavailable, Toast.LENGTH_SHORT).show();
        } catch (Exception failed) {
            Toast.makeText(activity, R.string.share_unavailable, Toast.LENGTH_SHORT).show();
        }
    }

    private static ClipData appendClip(ClipData existing, String label, Uri uri) {
        if (existing == null) {
            return ClipData.newRawUri(label, uri);
        }
        existing.addItem(new ClipData.Item(uri));
        return existing;
    }

    /**
     * "text" then the link. The page's text already ends with the link, so the
     * link is only appended when it is genuinely missing.
     */
    private static String composeMessage(String body, String link) {
        if (link.isEmpty()) {
            return body;
        }
        if (body.isEmpty()) {
            return link;
        }
        if (body.contains(link)) {
            return body;
        }
        return body + "\n" + link;
    }

    /** What the receiving app sees: one image, one video, both, or text only. */
    private static String mimeType(int streamCount, boolean hasVideo) {
        if (streamCount > 1) {
            return "*/*";
        }
        if (streamCount == 1) {
            return hasVideo ? "video/*" : "image/*";
        }
        return "text/plain";
    }

    private static boolean fetchable(String value) {
        if (value == null) {
            return false;
        }
        String trimmed = value.trim();
        return trimmed.startsWith("https://") || trimmed.startsWith("http://");
    }

    /**
     * Downloads one attachment into the share cache. Returns null on any failure
     * — an unavailable image must cost nothing more than a text-only share.
     */
    private static File download(Activity activity, String address, String prefix, int maxBytes) {
        HttpURLConnection connection = null;
        InputStream input = null;
        File target = null;
        try {
            File directory = ShareFileProvider.directory(activity);
            sweep(directory);
            // Deterministic name: a second share of the same title finds the
            // bytes already downloaded and opens the sheet instantly.
            target = new File(directory, keyFor(address) + ".part");

            URL url = new URL(address);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "image/*,video/*");
            connection.connect();
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                return null;
            }
            long declared = connection.getContentLengthLong();
            if (declared > maxBytes) {
                return null;
            }
            String extension = extensionFor(connection.getContentType(), address);
            File finished = new File(directory, target.getName().replace(".part", extension));

            input = new BufferedInputStream(connection.getInputStream(), 16384);
            FileOutputStream output = new FileOutputStream(target);
            try {
                byte[] buffer = new byte[16384];
                int total = 0;
                int read;
                while ((read = input.read(buffer)) > 0) {
                    total += read;
                    if (total > maxBytes) {
                        return null;
                    }
                    output.write(buffer, 0, read);
                }
                output.flush();
            } finally {
                output.close();
            }
            //noinspection ResultOfMethodCallIgnored
            target.renameTo(finished);
            return finished.exists() ? finished : target;
        } catch (Exception failed) {
            return null;
        } finally {
            if (input != null) {
                try {
                    input.close();
                } catch (Exception ignored) {
                    // Nothing to recover from.
                }
            }
            if (connection != null) {
                connection.disconnect();
            }
            if (target != null && target.exists() && target.getName().endsWith(".part")) {
                //noinspection ResultOfMethodCallIgnored
                target.delete();
            }
        }
    }

    /** Keeps the share cache from growing across many shares. */
    private static void sweep(File directory) {
        File[] files = directory.listFiles();
        if (files == null) {
            return;
        }
        long cutoff = System.currentTimeMillis() - STALE_EXPORT_MILLIS;
        for (File file : files) {
            if (file.lastModified() < cutoff) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        }
    }

    private static String extensionFor(String contentType, String address) {
        String type = contentType == null ? "" : contentType.toLowerCase();
        if (type.startsWith("video/mp4")) {
            return ".mp4";
        }
        if (type.startsWith("video/webm")) {
            return ".webm";
        }
        if (type.startsWith("image/png")) {
            return ".png";
        }
        if (type.startsWith("image/webp")) {
            return ".webp";
        }
        if (type.startsWith("image/jpeg") || type.startsWith("image/jpg")) {
            return ".jpg";
        }
        String path = address == null ? "" : address.toLowerCase();
        if (path.contains(".mp4")) {
            return ".mp4";
        }
        if (path.contains(".webm")) {
            return ".webm";
        }
        return ".jpg";
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }
}
