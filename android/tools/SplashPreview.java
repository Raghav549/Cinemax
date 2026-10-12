/*
 * Offline preview of the native Cinemax splash - no device, no emulator.
 *
 * It renders the real choreography: the timeline, the curves and the viewport
 * geometry all come from com.cinemax.app.SplashMotion (the same class the app
 * runs), and the logo is rasterised from the same drawable path data the app
 * ships (app/src/main/res/drawable/cinemax_emblem.xml). The drawing order and
 * the transforms mirror CinemaxSplashView.onDraw, using the same pre-rendered
 * radial-gradient sprites, the same sweep-layer clip and the same alpha / scale
 * / rise values.
 *
 * What it is for: checking the composition (is the logo complete, centred and
 * correctly sized on every screen shape, is the light restrained), the frame
 * strip (is the reveal continuous, is anything abrupt) and the hand-off frame.
 * What it is NOT: a substitute for the device. Anti-aliasing, colour blending
 * and frame pacing come from java.awt here, not from a real GPU, so the PNG is a
 * design preview - the on-device check list in android/README.md is still the
 * final gate.
 *
 * Usage (from the repository root):
 *   bash android/tools/preview-splash.sh
 *   (or, by hand:)
 *   java -jar android/.toolchain/lib/ecj.jar -source 8 -target 8 \
 *     -d <out>/classes android/app/src/main/java/com/cinemax/app/SplashMotion.java \
 *     android/tools/SplashPreview.java
 *   java -Djava.awt.headless=true -cp <out>/classes SplashPreview android <out>
 *
 * Output: <out>/preview/splash-timeline.png (one launch, frame by frame) and
 * <out>/preview/splash-screens.png (the settled frame on different screens).
 */

import com.cinemax.app.SplashMotion;

import java.awt.AlphaComposite;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.MultipleGradientPaint;
import java.awt.Paint;
import java.awt.RadialGradientPaint;
import java.awt.LinearGradientPaint;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.geom.Path2D;
import java.awt.geom.Point2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;
import javax.xml.parsers.DocumentBuilderFactory;

import org.w3c.dom.Document;
import org.w3c.dom.NodeList;

public final class SplashPreview {

    private static final String ANDROID_NS = "http://schemas.android.com/apk/res/android";

    /* The palette is deliberately duplicated from CinemaxSplashView: the preview
     * has to show the same colours, and reading them from the view source would
     * mean parsing Java. Any change there belongs here too. */
    private static final int INK = 0xFF050507;
    private static final int WASH_BLUE = 0x335E96FF;
    private static final int WASH_VIOLET = 0x147C4DFF;
    private static final int WASH_PINK = 0x17EF76CB;
    private static final int[] GLOW_COLOURS = {0x6BD8F0FF, 0x475E96FF, 0x2E7C4DFF, 0x17EF76CB, 0x08EF76CB, 0x00050507};
    private static final float[] GLOW_STOPS = {0f, 0.22f, 0.48f, 0.70f, 0.88f, 1f};
    private static final int[] DEPTH_COLOURS = {0xB8000000, 0x52000000, 0x00000000};
    private static final float[] DEPTH_STOPS = {0f, 0.45f, 1f};
    private static final int[] SWEEP_COLOURS = {0x00FF7AC8, 0x99FF7AC8, 0xE6FFFFFF, 0xB35EA8FF, 0x005EA8FF};
    private static final float[] SWEEP_STOPS = {0f, 0.26f, 0.52f, 0.78f, 1f};
    private static final float SWEEP_ANGLE = -20f;
    private static final int VIEWPORT = 64;

    public static void main(String[] args) throws Exception {
        File project = new File(args.length > 0 ? args[0] : "android");
        File output = new File(args.length > 1 ? args[1] : "android/build");
        File preview = new File(output, "preview");
        preview.mkdirs();

        Logo logo = Logo.read(new File(project, "app/src/main/res/drawable/cinemax_emblem.xml"));

        // One launch, frame by frame (the phone viewport the app targets).
        long[] times = {0L, 150L, 300L, 450L, 600L, 750L, 900L, SplashMotion.REVEAL_MILLIS};
        List<BufferedImage> frames = new ArrayList<BufferedImage>();
        for (long time : times) {
            frames.add(render(1080, 2280, 2.75f, time, logo));
        }
        writeSheet(new File(preview, "splash-timeline.png"), frames, label(times), 216);

        // The settled frame on every screen shape the size rule has to survive.
        int[][] screens = {{240, 320}, {360, 640}, {411, 891}, {800, 1280}, {915, 412}, {1440, 3120}};
        int[] screenDensities = {1, 2, 3, 4, 5, 6}; // index into densities below
        float[] densities = {1f, 2f, 2.75f, 2f, 2.75f, 3.5f};
        List<BufferedImage> settled = new ArrayList<BufferedImage>();
        List<String> settledLabels = new ArrayList<String>();
        for (int index = 0; index < screens.length; index++) {
            int width = screens[index][0];
            int height = screens[index][1];
            float density = densities[screenDensities[index] - 1];
            settled.add(render(width, height, density, SplashMotion.REVEAL_MILLIS, logo));
            settledLabels.add(width + "x" + height + " px  ("
                    + Math.round(width / density) + "x" + Math.round(height / density) + " dp)");
        }
        writeSheet(new File(preview, "splash-screens.png"), settled,
                settledLabels.toArray(new String[0]), 420);

        // One full-size settled frame, for judging the composition by eye.
        BufferedImage hero = render(1080, 2280, 2.75f, SplashMotion.REVEAL_MILLIS, logo);
        BufferedImage heroSmall = new BufferedImage(720, 1520, BufferedImage.TYPE_INT_RGB);
        Graphics2D heroGraphics = quality(heroSmall.createGraphics());
        heroGraphics.drawImage(hero, 0, 0, 720, 1520, null);
        heroGraphics.dispose();
        ImageIO.write(heroSmall, "png", new File(preview, "splash-settled.png"));

        // The light sweep, close up: the frames in which the band crosses the logo.
        List<BufferedImage> sweepFrames = new ArrayList<BufferedImage>();
        List<String> sweepLabels = new ArrayList<String>();
        for (long time = 560L; time <= SplashMotion.REVEAL_MILLIS; time += 60L) {
            sweepFrames.add(cropToLogo(render(1080, 2280, 2.75f, time, logo)));
            sweepLabels.add(time + " ms");
        }
        writeSheet(new File(preview, "splash-sweep.png"), sweepFrames,
                sweepLabels.toArray(new String[0]), 360);

        // Frame-by-frame continuity: the mean and maximum change between
        // consecutive 16 ms frames of the real composition. A well-eased reveal
        // ramps up and back down smoothly - a sudden spike means something snaps.
        System.out.println("frame    t(ms)   mean-diff  max-diff  (0-255, consecutive frames)");
        double previousMean = -1;
        double largest = 0;
        double largestMean = 0;
        double largestMeanAt = 0;
        double largestJerk = 0;
        long largestAt = 0;
        for (long time = 0L; time <= SplashMotion.REVEAL_MILLIS; time += 16L) {
            double mean = 0;
            if (time > 0L) {
                double[] diff = meanAbsoluteDifference(
                        render(540, 1140, 1.5f, time - 16L, logo),
                        render(540, 1140, 1.5f, time, logo));
                mean = diff[0];
                if (diff[1] > largest) {
                    largest = diff[1];
                }
                if (mean > largestMean) {
                    largestMean = mean;
                    largestMeanAt = time;
                }
                if (previousMean >= 0) {
                    double jerk = Math.abs(mean - previousMean);
                    if (jerk > largestJerk) {
                        largestJerk = jerk;
                        largestAt = time;
                    }
                }
                System.out.printf("        %6d   %8.3f   %8.1f%n", time, mean, diff[1]);
                previousMean = mean;
            }
        }
        System.out.println("largest single-frame mean change : " + String.format("%.3f", largestMean)
                + " at " + (long) largestMeanAt + " ms");
        System.out.println("largest pixel change in one frame: " + String.format("%.1f", largest) + " / 255");
        System.out.println("largest change of pace           : " + String.format("%.3f", largestJerk)
                + " at " + largestAt + " ms");

        System.out.println("timeline : " + new File(preview, "splash-timeline.png").getPath());
        System.out.println("screens  : " + new File(preview, "splash-screens.png").getPath());
        System.out.println("settled  : " + new File(preview, "splash-settled.png").getPath());
        System.out.println("sweep    : " + new File(preview, "splash-sweep.png").getPath());
        System.out.println("reveal   : " + SplashMotion.REVEAL_MILLIS + " ms, hand-off ready at "
                + SplashMotion.HANDOFF_READY_MILLIS + " ms, fade "
                + SplashMotion.HANDOFF_FADE_MILLIS + " ms");
    }

    private static String[] label(long[] times) {
        String[] labels = new String[times.length];
        for (int index = 0; index < times.length; index++) {
            labels[index] = times[index] + " ms";
        }
        return labels;
    }

    /* ------------------------------------------------------------- renderer */

    /** Mirrors CinemaxSplashView.onDraw for one frame of the intro timeline. */
    private static BufferedImage render(int width, int height, float density, long elapsed, Logo logo) {
        SplashMotion.Layout layout = SplashMotion.layout(width, height, density);
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = quality(image.createGraphics());
        g.setColor(new Color(INK, true));
        g.fillRect(0, 0, width, height);

        float ambient = SplashMotion.ambientAlpha(SplashMotion.progress(elapsed, SplashMotion.LAYER_AMBIENT));
        if (ambient > 0.004f) {
            g.setComposite(AlphaComposite.SrcOver.derive(ambient));
            g.drawImage(ambient(layout.ambientSpriteWidth, layout.ambientSpriteHeight), 0, 0, width, height, null);
            g.setComposite(AlphaComposite.SrcOver);
        }

        float glow = SplashMotion.glowAlpha(SplashMotion.progress(elapsed, SplashMotion.LAYER_GLOW));
        if (glow > 0.004f) {
            float scale = SplashMotion.glowScale(
                    SplashMotion.progress(elapsed, SplashMotion.LAYER_GLOW));
            float radiusX = layout.glowRadius * SplashMotion.GLOW_WIDTH_FACTOR * scale;
            float radiusY = layout.glowRadius * SplashMotion.GLOW_HEIGHT_FACTOR * scale;
            float glowY = layout.centreY - layout.logoSize * SplashMotion.GLOW_LIFT_FACTOR;
            g.setComposite(AlphaComposite.SrcOver.derive(glow));
            g.drawImage(sprite(layout.glowSpriteSide, GLOW_COLOURS, GLOW_STOPS),
                    Math.round(layout.centreX - radiusX), Math.round(glowY - radiusY),
                    Math.round(radiusX * 2f), Math.round(radiusY * 2f), null);
            g.setComposite(AlphaComposite.SrcOver);
        }

        float depth = SplashMotion.depthAlpha(SplashMotion.progress(elapsed, SplashMotion.LAYER_DEPTH));
        if (depth > 0.004f) {
            int side = Math.max(48, layout.glowSpriteSide / 2);
            float radius = layout.depthRadius;
            float centreY = layout.centreY + layout.depthOffsetY;
            g.setComposite(AlphaComposite.SrcOver.derive(depth));
            g.drawImage(sprite(side, DEPTH_COLOURS, DEPTH_STOPS),
                    Math.round(layout.centreX - radius), Math.round(centreY - radius),
                    Math.round(radius * 2f), Math.round(radius * 2f), null);
            g.setComposite(AlphaComposite.SrcOver);
        }

        float logoProgress = SplashMotion.progress(elapsed, SplashMotion.LAYER_LOGO);
        float logoAlpha = SplashMotion.logoAlpha(logoProgress);
        if (logoAlpha > 0.004f) {
            float half = layout.logoSize
                    * SplashMotion.logoScale(logoProgress, layout.logoStartScale) * 0.5f;
            float sweepProgress = SplashMotion.progress(elapsed, SplashMotion.LAYER_SWEEP);
            float travel = SplashMotion.sweepTravel(sweepProgress);
            float sweepAlpha = SplashMotion.sweepAlpha(sweepProgress);
            boolean sweeping = sweepAlpha > 0.004f && SplashMotion.sweepOverLogo(travel);
            int extent = Math.round(layout.sweepHalfExtent);
            int left = Math.round(layout.centreX) - extent;
            int top = Math.round(layout.centreY) - extent;

            if (!sweeping) {
                logo.draw(g, layout.centreX, layout.centreY, half * 2f, logoAlpha);
            } else {
                BufferedImage layer = new BufferedImage(extent * 2, extent * 2, BufferedImage.TYPE_INT_ARGB);
                Graphics2D lg = quality(layer.createGraphics());
                lg.translate(-left, -top);
                logo.draw(lg, layout.centreX, layout.centreY, half * 2f, logoAlpha);
                lg.setComposite(AlphaComposite.SrcAtop.derive(sweepAlpha));
                lg.translate(layout.centreX
                        + travel * (layout.logoSize * 0.5f + layout.sweepBandHalf), layout.centreY);
                lg.rotate(Math.toRadians(SWEEP_ANGLE));
                float bandHalf = layout.sweepBandHalf;
                float bandHalfHeight = layout.sweepBandHalfHeight;
                lg.setPaint(new LinearGradientPaint(
                        new Point2D.Float(-bandHalf, 0f), new Point2D.Float(bandHalf, 0f),
                        SWEEP_STOPS, colours(SWEEP_COLOURS), MultipleGradientPaint.CycleMethod.NO_CYCLE));
                lg.fillRect(Math.round(-bandHalf), Math.round(-bandHalfHeight),
                        Math.round(bandHalf * 2f), Math.round(bandHalfHeight * 2f));
                lg.dispose();
                g.drawImage(layer, left, top, null);
            }
        }
        g.dispose();
        return image;
    }

    private static BufferedImage ambient(int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = quality(image.createGraphics());
        float longEdge = Math.max(width, height);
        g.setPaint(radial(width * 0.30f, height * 0.24f, longEdge * 0.62f, WASH_BLUE));
        g.fillRect(0, 0, width, height);
        g.setPaint(radial(width * 0.52f, height * 0.50f, longEdge * 0.36f, WASH_VIOLET));
        g.fillRect(0, 0, width, height);
        g.setPaint(radial(width * 0.74f, height * 0.66f, longEdge * 0.56f, WASH_PINK));
        g.fillRect(0, 0, width, height);
        g.dispose();
        return image;
    }

    private static BufferedImage sprite(int side, int[] colours, float[] stops) {
        BufferedImage image = new BufferedImage(side, side, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = quality(image.createGraphics());
        float radius = side * 0.5f;
        g.setPaint(new RadialGradientPaint(new Point2D.Float(radius, radius), radius, stops,
                colours(colours), MultipleGradientPaint.CycleMethod.NO_CYCLE));
        g.fillRect(0, 0, side, side);
        g.dispose();
        return image;
    }

    private static Paint radial(float x, float y, float radius, int colour) {
        return new RadialGradientPaint(new Point2D.Float(x, y), Math.max(1f, radius),
                new float[]{0f, 1f},
                new Color[]{new Color(colour, true), new Color(colour & 0x00FFFFFF, true)},
                MultipleGradientPaint.CycleMethod.NO_CYCLE);
    }

    private static Color[] colours(int[] values) {
        Color[] colours = new Color[values.length];
        for (int index = 0; index < values.length; index++) {
            colours[index] = new Color(values[index], true);
        }
        return colours;
    }

    private static Graphics2D quality(Graphics2D g) {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
        return g;
    }

    /** Cuts a square around the logo, so the sweep can be seen up close. */
    private static BufferedImage cropToLogo(BufferedImage frame) {
        int side = Math.round(SplashMotion.layout(frame.getWidth(), frame.getHeight(), 2.75f).logoSize * 1.35f);
        int left = Math.max(0, frame.getWidth() / 2 - side / 2);
        int top = Math.max(0, frame.getHeight() / 2 - side / 2);
        return frame.getSubimage(left, top, Math.min(side, frame.getWidth() - left),
                Math.min(side, frame.getHeight() - top));
    }

    /** {mean, max} absolute per-channel change between two equally sized frames. */
    private static double[] meanAbsoluteDifference(BufferedImage a, BufferedImage b) {
        long total = 0;
        int count = 0;
        int largest = 0;
        for (int y = 0; y < a.getHeight(); y++) {
            for (int x = 0; x < a.getWidth(); x++) {
                int first = a.getRGB(x, y);
                int second = b.getRGB(x, y);
                for (int shift = 0; shift <= 16; shift += 8) {
                    int delta = Math.abs(((first >> shift) & 0xFF) - ((second >> shift) & 0xFF));
                    total += delta;
                    count++;
                    if (delta > largest) {
                        largest = delta;
                    }
                }
            }
        }
        return new double[]{count == 0 ? 0 : total / (double) count, largest};
    }

    /* -------------------------------------------------------------- sheets */

    private static void writeSheet(File file, List<BufferedImage> frames, String[] labels,
            int targetHeight) throws Exception {
        int gap = 18;
        int caption = 26;
        int scaledWidth = 0;
        List<BufferedImage> scaled = new ArrayList<BufferedImage>();
        for (BufferedImage frame : frames) {
            int width = Math.max(1, Math.round(frame.getWidth() * (targetHeight / (float) frame.getHeight())));
            BufferedImage small = new BufferedImage(width, targetHeight, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = quality(small.createGraphics());
            g.setColor(new Color(0x101014));
            g.fillRect(0, 0, width, targetHeight);
            g.drawImage(frame, 0, 0, width, targetHeight, null);
            g.dispose();
            scaled.add(small);
            scaledWidth += width;
        }
        int totalWidth = scaledWidth + gap * (scaled.size() + 1);
        int totalHeight = targetHeight + caption + gap * 2;
        BufferedImage sheet = new BufferedImage(totalWidth, totalHeight, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = quality(sheet.createGraphics());
        g.setColor(new Color(0x17171C));
        g.fillRect(0, 0, totalWidth, totalHeight);
        g.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 15));
        int x = gap;
        for (int index = 0; index < scaled.size(); index++) {
            BufferedImage image = scaled.get(index);
            g.drawImage(image, x, gap, null);
            g.setColor(new Color(0xC7BCE8));
            if (labels != null && index < labels.length) {
                g.drawString(labels[index], x + 2, gap + targetHeight + 19);
            }
            x += image.getWidth() + gap;
        }
        g.dispose();
        ImageIO.write(sheet, "png", file);
    }

    /* --------------------------------------------------------------- logo */

    /**
     * The Cinemax logo, read from the drawable the app ships: the two filled
     * ribbons with their gradients and the two light edge strokes.
     */
    private static final class Logo {

        private static final class Part {
            Path2D path;
            int[] colours;
            float[] stops;
            float x1;
            float y1;
            float x2;
            float y2;
            Color stroke;
            float strokeWidth;
        }

        private final List<Part> parts = new ArrayList<Part>();

        static Logo read(File vector) throws Exception {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            Document document = factory.newDocumentBuilder().parse(vector);
            NodeList paths = document.getElementsByTagNameNS("*", "path");
            Logo logo = new Logo();
            for (int index = 0; index < paths.getLength(); index++) {
                org.w3c.dom.Element element = (org.w3c.dom.Element) paths.item(index);
                Part part = new Part();
                part.path = SvgPath.parse(element.getAttributeNS(ANDROID_NS, "pathData"));
                String stroke = element.getAttributeNS(ANDROID_NS, "strokeColor");
                if (stroke != null && stroke.length() > 0) {
                    part.stroke = new Color((int) Long.parseLong(stroke.replace("#", ""), 16), true);
                    part.strokeWidth = Float.parseFloat(element.getAttributeNS(ANDROID_NS, "strokeWidth"));
                    logo.parts.add(part);
                    continue;
                }
                NodeList gradients = element.getElementsByTagNameNS("*", "gradient");
                if (gradients.getLength() == 0) {
                    continue;
                }
                org.w3c.dom.Element gradient = (org.w3c.dom.Element) gradients.item(0);
                part.x1 = Float.parseFloat(gradient.getAttributeNS(ANDROID_NS, "startX"));
                part.y1 = Float.parseFloat(gradient.getAttributeNS(ANDROID_NS, "startY"));
                part.x2 = Float.parseFloat(gradient.getAttributeNS(ANDROID_NS, "endX"));
                part.y2 = Float.parseFloat(gradient.getAttributeNS(ANDROID_NS, "endY"));
                NodeList items = gradient.getElementsByTagNameNS("*", "item");
                part.colours = new int[items.getLength()];
                part.stops = new float[items.getLength()];
                for (int stop = 0; stop < items.getLength(); stop++) {
                    org.w3c.dom.Element item = (org.w3c.dom.Element) items.item(stop);
                    String colour = item.getAttributeNS(ANDROID_NS, "color");
                    part.colours[stop] = (int) Long.parseLong(colour.replace("#", ""), 16);
                    if (part.colours[stop] <= 0xFFFFFF) {
                        part.colours[stop] |= 0xFF000000;
                    }
                    part.stops[stop] = Float.parseFloat(item.getAttributeNS(ANDROID_NS, "offset"));
                }
                logo.parts.add(part);
            }
            if (logo.parts.size() < 4) {
                throw new IllegalStateException("expected 4 logo paths, found " + logo.parts.size());
            }
            return logo;
        }

        /** Draws the logo into a square box of {@code size} px, centred where asked. */
        void draw(Graphics2D g, float centreX, float centreY, float size, float alpha) {
            float scale = size / VIEWPORT;
            AffineTransform transform = new AffineTransform();
            transform.translate(centreX - size * 0.5f, centreY - size * 0.5f);
            transform.scale(scale, scale);
            g.setComposite(AlphaComposite.SrcOver.derive(alpha));
            for (Part part : parts) {
                Path2D shape = (Path2D) part.path.clone();
                shape.transform(transform);
                if (part.stroke != null) {
                    g.setStroke(new BasicStroke(Math.max(0.5f, part.strokeWidth * scale),
                            BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
                    g.setColor(part.stroke);
                    g.draw(shape);
                    continue;
                }
                Point2D start = transform.transform(new Point2D.Float(part.x1, part.y1), null);
                Point2D end = transform.transform(new Point2D.Float(part.x2, part.y2), null);
                g.setPaint(new LinearGradientPaint(start, end, part.stops, colours(part.colours),
                        MultipleGradientPaint.CycleMethod.NO_CYCLE));
                g.fill(shape);
            }
            g.setComposite(AlphaComposite.SrcOver);
        }
    }

    /* ----------------------------------------------------------- svg paths */

    /**
     * The subset of SVG path data the logo uses: move, line, circular arc and
     * close, absolute and relative. Enough for app/src/main/res/drawable/
     * cinemax_emblem.xml, and it fails loudly on anything else.
     */
    private static final class SvgPath {

        static Path2D parse(String data) {
            Path2D path = new Path2D.Double();
            StringBuilder spaced = new StringBuilder(data.length() + 16);
            for (int cursor = 0; cursor < data.length(); cursor++) {
                char character = data.charAt(cursor);
                if (Character.isLetter(character)) {
                    spaced.append(' ').append(character).append(' ');
                } else if (character == ',') {
                    spaced.append(' ');
                } else {
                    spaced.append(character);
                }
            }
            String[] tokens = spaced.toString().trim().split("\\s+");
            int index = 0;
            char command = 'M';
            double currentX = 0;
            double currentY = 0;
            double startX = 0;
            double startY = 0;
            while (index < tokens.length) {
                String token = tokens[index];
                if (token.length() == 1 && Character.isLetter(token.charAt(0))) {
                    command = token.charAt(0);
                    index++;
                    continue;
                }
                char upper = Character.toUpperCase(command);
                boolean relative = Character.isLowerCase(command);
                if (upper == 'M' || upper == 'L') {
                    double x = Double.parseDouble(tokens[index++]);
                    double y = Double.parseDouble(tokens[index++]);
                    if (relative) {
                        x += currentX;
                        y += currentY;
                    }
                    if (upper == 'M') {
                        path.moveTo(x, y);
                        startX = x;
                        startY = y;
                        command = relative ? 'l' : 'L';
                    } else {
                        path.lineTo(x, y);
                    }
                    currentX = x;
                    currentY = y;
                } else if (upper == 'A') {
                    double rx = Double.parseDouble(tokens[index++]);
                    double ry = Double.parseDouble(tokens[index++]);
                    index++; // x-axis rotation: the logo's arcs are circular
                    boolean largeArc = Double.parseDouble(tokens[index++]) != 0;
                    boolean sweep = Double.parseDouble(tokens[index++]) != 0;
                    double x = Double.parseDouble(tokens[index++]);
                    double y = Double.parseDouble(tokens[index++]);
                    if (relative) {
                        x += currentX;
                        y += currentY;
                    }
                    arc(path, currentX, currentY, Math.max(rx, ry), largeArc, sweep, x, y);
                    currentX = x;
                    currentY = y;
                } else if (upper == 'Z') {
                    path.closePath();
                    currentX = startX;
                    currentY = startY;
                    index++;
                } else {
                    throw new IllegalArgumentException("unsupported path command: " + command);
                }
            }
            return path;
        }

        /** Appends a circular SVG arc (or the two-point degenerate cases). */
        private static void arc(Path2D path, double x0, double y0, double radius,
                boolean largeArc, boolean sweep, double x1, double y1) {
            double chord = Math.hypot(x1 - x0, y1 - y0);
            if (chord < 0.0001) {
                return;
            }
            double r = Math.max(radius, chord / 2);
            double midX = (x0 + x1) / 2;
            double midY = (y0 + y1) / 2;
            double offset = Math.sqrt(Math.max(0, r * r - (chord / 2) * (chord / 2)));
            double normalX = -(y1 - y0) / chord;
            double normalY = (x1 - x0) / chord;
            if (largeArc == sweep) {
                normalX = -normalX;
                normalY = -normalY;
            }
            double centreX = midX + normalX * offset;
            double centreY = midY + normalY * offset;
            double startAngle = Math.toDegrees(Math.atan2(y0 - centreY, x0 - centreX));
            double endAngle = Math.toDegrees(Math.atan2(y1 - centreY, x1 - centreX));
            double extent = endAngle - startAngle;
            if (sweep && extent < 0) {
                extent += 360;
            } else if (!sweep && extent > 0) {
                extent -= 360;
            }
            path.append(new java.awt.geom.Arc2D.Double(centreX - r, centreY - r, r * 2, r * 2,
                    startAngle, extent, java.awt.geom.Arc2D.OPEN), true);
        }
    }
}
