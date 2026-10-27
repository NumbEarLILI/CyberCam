package app.cybercam.android;

import android.graphics.ImageFormat;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.media.Image;
import android.media.ImageReader;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.util.Size;
import android.view.Surface;
import androidx.annotation.NonNull;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

final class CameraSession {
    interface Listener {
        void onFrame(byte[] jpeg, int rotation);

        void onReady();

        void onFailed(String message);

        void onStill(byte[] jpeg);

        void onCaptureFailed(String message);
    }

    private final CameraManager manager;
    private final HandlerThread thread;
    private final Handler handler;
    private final Executor executor;
    private CameraDevice device;
    private CameraCaptureSession session;
    private ImageReader previewReader;
    private ImageReader stillReader;
    private CameraCatalog.Entry entry;
    private Listener listener;
    private int generation;
    private long lastPreview;
    private static final long PREVIEW_INTERVAL_MS = 30;
    private static final int PREVIEW_QUALITY = 88;
    private static final int PREVIEW_LONG_EDGE = 1280;
    private byte[] nv21;
    private byte[] rowA;
    private byte[] rowB;
    private final ByteArrayOutputStream encoded = new ByteArrayOutputStream(256 * 1024);
    private final AtomicBoolean stillPending = new AtomicBoolean(false);
    private volatile int displayRotation = Surface.ROTATION_0;

    CameraSession(CameraManager manager) {
        this.manager = manager;
        thread = new HandlerThread("cybercam-camera");
        thread.start();
        handler = new Handler(thread.getLooper());
        executor = handler::post;
    }

    void start(CameraCatalog.Entry next, Listener nextListener) {
        int ticket = ++generation;
        handler.post(() -> {
            if (ticket != generation) return;
            closeQuietly();
            entry = next;
            listener = nextListener;
            boolean routePhysical = false;
            String openId = next.openId;
            if (next.physicalId != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                try {
                    manager.openCamera(next.physicalId, opened(ticket, false), handler);
                    return;
                } catch (IllegalArgumentException exception) {
                    routePhysical = true;
                } catch (SecurityException exception) {
                    fail(ticket, "permission");
                    return;
                } catch (Exception exception) {
                    routePhysical = true;
                }
            }
            try {
                manager.openCamera(openId, opened(ticket, routePhysical), handler);
            } catch (SecurityException exception) {
                fail(ticket, "permission");
            } catch (Exception exception) {
                fail(ticket, "open-failed");
            }
        });
    }

    private CameraDevice.StateCallback opened(int ticket, boolean routePhysical) {
        return new CameraDevice.StateCallback() {
            @Override
            public void onOpened(@NonNull CameraDevice camera) {
                if (ticket != generation) {
                    camera.close();
                    return;
                }
                device = camera;
                configure(camera, entry, ticket, routePhysical);
            }

            @Override
            public void onDisconnected(@NonNull CameraDevice camera) {
                camera.close();
                if (ticket == generation) fail(ticket, "disconnected");
            }

            @Override
            public void onError(@NonNull CameraDevice camera, int error) {
                camera.close();
                if (ticket == generation) fail(ticket, "open-failed");
            }
        };
    }

    void captureStill() {
        handler.post(() -> {
            if (session == null || device == null || stillReader == null || entry == null) {
                if (listener != null) listener.onCaptureFailed("not-open");
                return;
            }
            try {
                stillPending.set(true);
                CaptureRequest.Builder builder = device.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
                builder.addTarget(stillReader.getSurface());
                builder.set(CaptureRequest.JPEG_ORIENTATION, orientation());
                builder.set(CaptureRequest.JPEG_QUALITY, (byte) 97);
                builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                session.capture(builder.build(), null, handler);
            } catch (Exception exception) {
                stillPending.set(false);
                if (listener != null) listener.onCaptureFailed("capture-failed");
            }
        });
    }

    void stop() {
        generation++;
        handler.post(this::closeQuietly);
    }

    void release() {
        stop();
        thread.quitSafely();
    }

    private void configure(CameraDevice camera, CameraCatalog.Entry target, int ticket, boolean routePhysical) {
        try {
            Size stillSize = CameraCatalog.chooseLargest(target.characteristics, ImageFormat.JPEG, 4096);
            Size previewSize = CameraCatalog.chooseMatching(target.characteristics, ImageFormat.YUV_420_888, PREVIEW_LONG_EDGE, stillSize);
            previewReader = ImageReader.newInstance(previewSize.getWidth(), previewSize.getHeight(), ImageFormat.YUV_420_888, 2);
            stillReader = ImageReader.newInstance(stillSize.getWidth(), stillSize.getHeight(), ImageFormat.JPEG, 2);
            previewReader.setOnImageAvailableListener(reader -> onPreview(reader, ticket), handler);
            stillReader.setOnImageAvailableListener(reader -> onStill(reader, ticket), handler);
            if (routePhysical && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && target.physicalId != null) {
                android.hardware.camera2.params.OutputConfiguration preview =
                    new android.hardware.camera2.params.OutputConfiguration(previewReader.getSurface());
                android.hardware.camera2.params.OutputConfiguration still =
                    new android.hardware.camera2.params.OutputConfiguration(stillReader.getSurface());
                preview.setPhysicalCameraId(target.physicalId);
                still.setPhysicalCameraId(target.physicalId);
                android.hardware.camera2.params.SessionConfiguration configuration =
                    new android.hardware.camera2.params.SessionConfiguration(
                        android.hardware.camera2.params.SessionConfiguration.SESSION_REGULAR,
                        Arrays.asList(preview, still),
                        executor,
                        callback(camera, ticket)
                    );
                camera.createCaptureSession(configuration);
            } else {
                camera.createCaptureSession(
                    Arrays.asList(previewReader.getSurface(), stillReader.getSurface()),
                    callback(camera, ticket),
                    handler
                );
            }
        } catch (Exception exception) {
            fail(ticket, "open-failed");
        }
    }

    private CameraCaptureSession.StateCallback callback(CameraDevice camera, int ticket) {
        return new CameraCaptureSession.StateCallback() {
            @Override
            public void onConfigured(@NonNull CameraCaptureSession nextSession) {
                if (ticket != generation) {
                    nextSession.close();
                    return;
                }
                session = nextSession;
                try {
                    CaptureRequest.Builder builder = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                    builder.addTarget(previewReader.getSurface());
                    builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                    nextSession.setRepeatingRequest(builder.build(), null, handler);
                    if (listener != null) listener.onReady();
                } catch (CameraAccessException exception) {
                    fail(ticket, "open-failed");
                }
            }

            @Override
            public void onConfigureFailed(@NonNull CameraCaptureSession nextSession) {
                fail(ticket, "open-failed");
            }
        };
    }

    private void onPreview(ImageReader reader, int ticket) {
        Image image = reader.acquireLatestImage();
        if (image == null) return;
        try {
            if (ticket != generation || listener == null) return;
            long now = SystemClock.elapsedRealtime();
            if (now - lastPreview < PREVIEW_INTERVAL_MS) return;
            byte[] jpeg = yuvToJpeg(image);
            lastPreview = now;
            listener.onFrame(jpeg, orientation());
        } catch (Exception ignored) {
        } finally {
            image.close();
        }
    }

    private void onStill(ImageReader reader, int ticket) {
        Image image = reader.acquireLatestImage();
        if (image == null) return;
        try {
            if (ticket != generation || listener == null || !stillPending.compareAndSet(true, false)) return;
            ByteBuffer buffer = image.getPlanes()[0].getBuffer();
            byte[] jpeg = new byte[buffer.remaining()];
            buffer.get(jpeg);
            listener.onStill(jpeg);
        } catch (Exception exception) {
            stillPending.set(false);
            if (listener != null) listener.onCaptureFailed("capture-failed");
        } finally {
            image.close();
        }
    }

    private int orientation() {
        return CameraCatalog.jpegOrientation(entry == null ? null : entry.characteristics, displayRotation);
    }

    void setDisplayRotation(int rotation) {
        handler.post(() -> displayRotation = rotation);
    }

    private void fail(int ticket, String message) {
        if (ticket != generation) return;
        Listener current = listener;
        closeQuietly();
        if (current != null) current.onFailed(message);
    }

    private void closeQuietly() {
        stillPending.set(false);
        try {
            if (session != null) session.close();
        } catch (Exception ignored) {
        }
        try {
            if (device != null) device.close();
        } catch (Exception ignored) {
        }
        try {
            if (previewReader != null) previewReader.close();
        } catch (Exception ignored) {
        }
        try {
            if (stillReader != null) stillReader.close();
        } catch (Exception ignored) {
        }
        session = null;
        device = null;
        previewReader = null;
        stillReader = null;
    }

    /** Encodes once in sensor orientation; the web view rotates the frame on the GPU. */
    private byte[] yuvToJpeg(Image image) {
        int width = image.getWidth();
        int height = image.getHeight();
        YuvImage yuv = new YuvImage(toNv21(image), ImageFormat.NV21, width, height, null);
        encoded.reset();
        yuv.compressToJpeg(new Rect(0, 0, width, height), PREVIEW_QUALITY, encoded);
        return encoded.toByteArray();
    }

    private byte[] toNv21(Image image) {
        int width = image.getWidth();
        int height = image.getHeight();
        int size = width * height * 3 / 2;
        if (nv21 == null || nv21.length != size) nv21 = new byte[size];
        Image.Plane yPlane = image.getPlanes()[0];
        Image.Plane uPlane = image.getPlanes()[1];
        Image.Plane vPlane = image.getPlanes()[2];
        int pos = copyPlane(yPlane, width, height, nv21, 0);
        int chromaHeight = height / 2;
        int chromaWidth = width / 2;
        ByteBuffer uBuffer = uPlane.getBuffer().duplicate();
        ByteBuffer vBuffer = vPlane.getBuffer().duplicate();
        int uStride = uPlane.getPixelStride();
        int vStride = vPlane.getPixelStride();
        int uSpan = (chromaWidth - 1) * uStride + 1;
        int vSpan = (chromaWidth - 1) * vStride + 1;
        if (rowA == null || rowA.length < vSpan) rowA = new byte[vSpan];
        if (rowB == null || rowB.length < uSpan) rowB = new byte[uSpan];
        int uBase = uBuffer.position();
        int vBase = vBuffer.position();
        for (int row = 0; row < chromaHeight; row++) {
            vBuffer.position(vBase + row * vPlane.getRowStride());
            vBuffer.get(rowA, 0, vSpan);
            uBuffer.position(uBase + row * uPlane.getRowStride());
            uBuffer.get(rowB, 0, uSpan);
            for (int col = 0; col < chromaWidth; col++) {
                nv21[pos++] = rowA[col * vStride];
                nv21[pos++] = rowB[col * uStride];
            }
        }
        return nv21;
    }

    private int copyPlane(Image.Plane plane, int width, int height, byte[] out, int pos) {
        ByteBuffer buffer = plane.getBuffer().duplicate();
        int base = buffer.position();
        int rowStride = plane.getRowStride();
        int pixelStride = plane.getPixelStride();
        if (pixelStride == 1) {
            for (int row = 0; row < height; row++) {
                buffer.position(base + row * rowStride);
                buffer.get(out, pos, width);
                pos += width;
            }
            return pos;
        }
        int span = (width - 1) * pixelStride + 1;
        if (rowA == null || rowA.length < span) rowA = new byte[span];
        for (int row = 0; row < height; row++) {
            buffer.position(base + row * rowStride);
            buffer.get(rowA, 0, span);
            for (int col = 0; col < width; col++) out[pos++] = rowA[col * pixelStride];
        }
        return pos;
    }
}
