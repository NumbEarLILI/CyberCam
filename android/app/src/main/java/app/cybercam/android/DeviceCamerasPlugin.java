package app.cybercam.android;

import android.Manifest;
import android.content.Context;
import android.hardware.camera2.CameraManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Surface;
import android.view.WindowManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(
    name = "DeviceCameras",
    permissions = { @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera") }
)
public class DeviceCamerasPlugin extends Plugin {
    private CameraSession session;
    private CameraCatalog catalog;
    private PluginCall startCall;
    private PluginCall captureCall;
    private String activeId;
    private int openGeneration;
    private boolean resumed = true;
    private final Handler main = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void list(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "permissionResult");
            return;
        }
        resolveList(call);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "permissionResult");
            return;
        }
        resolveStart(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        activeId = null;
        if (session != null) session.stop();
        call.resolve();
    }

    @PluginMethod
    public void capture(PluginCall call) {
        if (session == null || activeId == null) {
            call.reject("not-open");
            return;
        }
        captureCall = call;
        session.captureStill();
        main.postDelayed(() -> {
            if (captureCall == call) {
                captureCall = null;
                call.reject("timeout");
            }
        }, 4000);
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("permission");
            return;
        }
        if ("list".equals(call.getMethodName())) resolveList(call);
        else if ("start".equals(call.getMethodName())) resolveStart(call);
        else call.reject("permission");
    }

    private void resolveList(PluginCall call) {
        try {
            CameraManager manager = manager();
            catalog = CameraCatalog.read(manager);
            List<CameraCatalog.Entry> entries = new ArrayList<>(catalog.list());
            Collections.sort(entries, CameraCatalog.DISPLAY_ORDER);
            JSArray cameras = new JSArray();
            for (CameraCatalog.Entry entry : entries) {
                JSObject item = new JSObject();
                item.put("id", entry.id);
                item.put("facing", entry.facing);
                item.put("equivalent", entry.equivalent);
                item.put("physical", entry.physical);
                cameras.put(item);
            }
            JSObject result = new JSObject();
            result.put("cameras", cameras);
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("list-failed");
        }
    }

    private final CameraSession.Listener sessionListener = new CameraSession.Listener() {
        @Override
        public void onFrame(byte[] jpeg) {
            JSObject payload = new JSObject();
            payload.put("jpeg", Base64.encodeToString(jpeg, Base64.NO_WRAP));
            notifyListeners("frame", payload);
        }

        @Override
        public void onReady() {
            PluginCall pending = startCall;
            startCall = null;
            if (pending != null) pending.resolve();
        }

        @Override
        public void onFailed(String message) {
            PluginCall pendingStart = startCall;
            PluginCall pendingCapture = captureCall;
            startCall = null;
            captureCall = null;
            if (pendingStart != null) pendingStart.reject(message);
            if (pendingCapture != null) pendingCapture.reject(message);
        }

        @Override
        public void onStill(byte[] jpeg) {
            PluginCall pending = captureCall;
            captureCall = null;
            if (pending == null) return;
                    JSObject result = new JSObject();
                    result.put("jpeg", Base64.encodeToString(jpeg, Base64.NO_WRAP));
                    pending.resolve(result);
        }

        @Override
        public void onCaptureFailed(String message) {
            PluginCall pending = captureCall;
            captureCall = null;
            if (pending != null) pending.reject(message);
        }
    };

    private void resolveStart(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("missing-camera");
            return;
        }
        startCall = call;
        activeId = id;
        beginOpen();
    }

    private void beginOpen() {
        if (activeId == null || !resumed) return;
        int ticket = ++openGeneration;
        PluginCall call = startCall;
        try {
            if (catalog == null) catalog = CameraCatalog.read(manager());
            CameraCatalog.Entry entry = catalog.get(activeId);
            if (entry == null) {
                catalog = CameraCatalog.read(manager());
                entry = catalog.get(activeId);
            }
            if (entry == null) {
                if (call != null) {
                    startCall = null;
                    call.reject("missing-camera");
                }
                return;
            }
            if (session == null) session = new CameraSession(manager());
            session.setDisplayRotation(currentRotation());
            session.start(entry, sessionListener);
            if (call != null) {
                main.postDelayed(() -> {
                    if (ticket != openGeneration || startCall != call) return;
                    startCall = null;
                    if (session != null) session.stop();
                    call.reject("timeout");
                }, 8000);
            }
        } catch (Exception exception) {
            if (call != null) {
                startCall = null;
                call.reject("open-failed");
            }
        }
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        resumed = false;
        if (session != null) session.stop();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        resumed = true;
        if (activeId != null) beginOpen();
        if (getBridge() != null) getBridge().triggerDocumentJSEvent("cybercam-resume");
    }

    @Override
    protected void handleOnConfigurationChanged(android.content.res.Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        if (session != null) session.setDisplayRotation(currentRotation());
    }

    @Override
    protected void handleOnDestroy() {
        if (session != null) session.release();
        session = null;
        super.handleOnDestroy();
    }

    private CameraManager manager() {
        return (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
    }

    @SuppressWarnings("deprecation")
    private int currentRotation() {
        WindowManager window = (WindowManager) getContext().getSystemService(Context.WINDOW_SERVICE);
        if (window == null || window.getDefaultDisplay() == null) return Surface.ROTATION_0;
        return window.getDefaultDisplay().getRotation();
    }
}
