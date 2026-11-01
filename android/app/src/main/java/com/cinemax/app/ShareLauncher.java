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
import java.util.ArrayList;

/**
 * The native share sheet for a title.
 *
 * The page decides *what* a share contains (title, description, link, preview
 * image, trailer file) and this class hands it to Android's own
 * {@code Intent.createChooser}. There is no hardcoded list of apps and no
 * shortcut: the chooser lists whatever is installed, and every entry receives a
 * real {@code ACTION_SEND} intent.
 *
 * Artwork and trailer are downloaded into the app cache first, because a share
 * must carry bytes another app can read — a network URL in EXTRA_STREAM is not a
 * share on Android. They are exposed through {@link ShareFileProvider} as
 * {@code content://} URIs with a read grant, which is the only form Android 7+
 * accepts. A download that fails never blocks the share: the text and link are
 * still sent, and the sheet still opens.
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
                File image = fetchable(imageUrl)
                        ? download(activity, imageUrl, "card", MAX_IMAGE_BYTES)
                        : null;
                File video = fetchable(videoUrl)
                        ? download(activity, videoUrl, "trailer", MAX_VIDEO_BYTES)
                        : null;
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
            target = File.createTempFile(prefix + "-", ".part", directory);

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
