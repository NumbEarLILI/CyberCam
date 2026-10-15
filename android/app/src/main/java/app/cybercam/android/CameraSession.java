package app.cybercam.android;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
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
        void onFrame(byte[] jpeg);

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
            Size previewSize = CameraCatalog.choose(target.characteristics, ImageFormat.YUV_420_888, 640);
            Size stillSize = CameraCatalog.choose(target.characteristics, ImageFormat.JPEG, 1600);
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
            if (now - lastPreview < 70) return;
            byte[] jpeg = yuvToJpeg(image, orientation());
            lastPreview = now;
            listener.onFrame(jpeg);
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

    static byte[] yuvToJpeg(Image image, int angle) {
        int width = image.getWidth();
        int height = image.getHeight();
        byte[] nv21 = toNv21(image);
        YuvImage yuv = new YuvImage(nv21, ImageFormat.NV21, width, height, null);
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        yuv.compressToJpeg(new Rect(0, 0, width, height), 70, encoded);
        if (angle % 360 == 0) return encoded.toByteArray();
        Bitmap bitmap = BitmapFactory.decodeByteArray(encoded.toByteArray(), 0, encoded.size());
        if (bitmap == null) return encoded.toByteArray();
        Matrix matrix = new Matrix();
        matrix.postRotate(angle);
        Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
        ByteArrayOutputStream upright = new ByteArrayOutputStream();
        rotated.compress(Bitmap.CompressFormat.JPEG, 70, upright);
        if (rotated != bitmap) rotated.recycle();
        bitmap.recycle();
        return upright.toByteArray();
    }

    static byte[] toNv21(Image image) {
        int width = image.getWidth();
        int height = image.getHeight();
        byte[] nv21 = new byte[width * height * 3 / 2];
        Image.Plane yPlane = image.getPlanes()[0];
        Image.Plane uPlane = image.getPlanes()[1];
        Image.Plane vPlane = image.getPlanes()[2];
        ByteBuffer yBuffer = yPlane.getBuffer().duplicate();
        ByteBuffer uBuffer = uPlane.getBuffer().duplicate();
        ByteBuffer vBuffer = vPlane.getBuffer().duplicate();
        int yBase = yBuffer.position();
        int uBase = uBuffer.position();
        int vBase = vBuffer.position();
        int pos = 0;
        for (int row = 0; row < height; row++) {
            for (int col = 0; col < width; col++) {
                nv21[pos++] = yBuffer.get(yBase + row * yPlane.getRowStride() + col * yPlane.getPixelStride());
            }
        }
        int chromaHeight = height / 2;
        int chromaWidth = width / 2;
        for (int row = 0; row < chromaHeight; row++) {
            for (int col = 0; col < chromaWidth; col++) {
                nv21[pos++] = vBuffer.get(vBase + row * vPlane.getRowStride() + col * vPlane.getPixelStride());
                nv21[pos++] = uBuffer.get(uBase + row * uPlane.getRowStride() + col * uPlane.getPixelStride());
            }
        }
        return nv21;
    }
}
