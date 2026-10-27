package app.cybercam.android;

import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.os.Build;
import android.util.Size;
import android.util.SizeF;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class CameraCatalog {
    final Map<String, Entry> entries = new LinkedHashMap<>();

    static final class Entry {
        final String id;
        final String openId;
        final String physicalId;
        final String facing;
        final double equivalent;
        final boolean physical;
        final CameraCharacteristics characteristics;

        Entry(String id, String openId, String physicalId, String facing, double equivalent, boolean physical, CameraCharacteristics characteristics) {
            this.id = id;
            this.openId = openId;
            this.physicalId = physicalId;
            this.facing = facing;
            this.equivalent = equivalent;
            this.physical = physical;
            this.characteristics = characteristics;
        }
    }

    static CameraCatalog read(CameraManager manager) throws CameraAccessException {
        CameraCatalog catalog = new CameraCatalog();
        for (String id : manager.getCameraIdList()) {
            CameraCharacteristics characteristics = manager.getCameraCharacteristics(id);
            if (!backwardCompatible(characteristics)) continue;
            String facing = facingOf(characteristics);
            catalog.entries.put(id, new Entry(id, id, null, facing, equivalentOf(characteristics), false, characteristics));
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) continue;
            Set<String> physicalIds = characteristics.getPhysicalCameraIds();
            if (physicalIds == null) continue;
            List<String> ordered = new ArrayList<>(physicalIds);
            Collections.sort(ordered);
            for (String physicalId : ordered) {
                if (physicalId == null || catalog.entries.containsKey(physicalId)) continue;
                CameraCharacteristics physicalCharacteristics = characteristics;
                double equivalent = 0;
                try {
                    physicalCharacteristics = manager.getCameraCharacteristics(physicalId);
                    if (!backwardCompatible(physicalCharacteristics)) continue;
                    equivalent = equivalentOf(physicalCharacteristics);
                } catch (IllegalArgumentException ignored) {
                    physicalCharacteristics = characteristics;
                } catch (CameraAccessException ignored) {
                    physicalCharacteristics = characteristics;
                }
                catalog.entries.put(physicalId, new Entry(physicalId, id, physicalId, facing, equivalent, true, physicalCharacteristics));
            }
        }
        return catalog;
    }

    Entry get(String id) {
        return entries.get(id);
    }

    List<Entry> list() {
        return new ArrayList<>(entries.values());
    }

    static Size choose(CameraCharacteristics characteristics, int format, int targetLongEdge) {
        StreamConfigurationMap map = characteristics == null ? null : characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        Size[] sizes = map == null ? null : map.getOutputSizes(format);
        if (sizes == null || sizes.length == 0) {
            return targetLongEdge >= 1600 ? new Size(1920, 1080) : new Size(640, 480);
        }
        Size best = sizes[0];
        int bestScore = Integer.MAX_VALUE;
        for (Size size : sizes) {
            int edge = Math.max(size.getWidth(), size.getHeight());
            int score = edge <= targetLongEdge ? targetLongEdge - edge : 100000 + edge - targetLongEdge;
            if (score < bestScore) {
                bestScore = score;
                best = size;
            }
        }
        return best;
    }

    /** Largest size within the edge limit that keeps the still's aspect, so the preview is not a cropped 16:9 band. */
    static Size chooseMatching(CameraCharacteristics characteristics, int format, int maxLongEdge, Size still) {
        StreamConfigurationMap map = characteristics == null ? null : characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        Size[] sizes = map == null ? null : map.getOutputSizes(format);
        if (sizes == null || sizes.length == 0 || still == null || still.getHeight() == 0) {
            return choose(characteristics, format, maxLongEdge);
        }
        double target = (double) still.getWidth() / still.getHeight();
        Size best = null;
        int bestArea = -1;
        for (Size size : sizes) {
            if (size.getHeight() == 0) continue;
            int edge = Math.max(size.getWidth(), size.getHeight());
            double aspect = (double) size.getWidth() / size.getHeight();
            int area = size.getWidth() * size.getHeight();
            if (edge <= maxLongEdge && Math.abs(aspect - target) < 0.02 && area > bestArea) {
                best = size;
                bestArea = area;
            }
        }
        return best != null ? best : choose(characteristics, format, maxLongEdge);
    }

    static Size chooseLargest(CameraCharacteristics characteristics, int format, int maxLongEdge) {
        StreamConfigurationMap map = characteristics == null ? null : characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        Size[] sizes = map == null ? null : map.getOutputSizes(format);
        if (sizes == null || sizes.length == 0) return new Size(1920, 1440);
        Size best = null;
        int bestArea = -1;
        for (Size size : sizes) {
            int edge = Math.max(size.getWidth(), size.getHeight());
            int area = size.getWidth() * size.getHeight();
            if (edge <= maxLongEdge && area > bestArea) {
                best = size;
                bestArea = area;
            }
        }
        return best != null ? best : choose(characteristics, format, maxLongEdge);
    }

    static int jpegOrientation(CameraCharacteristics characteristics, int displayRotation) {
        if (characteristics == null) return 0;
        Integer sensor = characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION);
        Integer facing = characteristics.get(CameraCharacteristics.LENS_FACING);
        int sensorOrientation = sensor == null ? 0 : sensor;
        int rotation = displayDegrees(displayRotation);
        if (facing != null && facing == CameraCharacteristics.LENS_FACING_FRONT) {
            return (sensorOrientation + rotation) % 360;
        }
        return (sensorOrientation - rotation + 360) % 360;
    }

    private static int displayDegrees(int rotation) {
        switch (rotation) {
            case 1:
                return 90;
            case 2:
                return 180;
            case 3:
                return 270;
            default:
                return 0;
        }
    }

    private static boolean backwardCompatible(CameraCharacteristics characteristics) {
        int[] capabilities = characteristics.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
        if (capabilities == null) return true;
        for (int capability : capabilities) {
            if (capability == CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_BACKWARD_COMPATIBLE) return true;
        }
        return false;
    }

    private static String facingOf(CameraCharacteristics characteristics) {
        Integer facing = characteristics.get(CameraCharacteristics.LENS_FACING);
        if (facing == null) return "external";
        if (facing == CameraCharacteristics.LENS_FACING_FRONT) return "front";
        if (facing == CameraCharacteristics.LENS_FACING_BACK) return "back";
        return "external";
    }

    static double equivalentOf(CameraCharacteristics characteristics) {
        float[] focals = characteristics.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
        SizeF sensor = characteristics.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE);
        if (focals == null || focals.length == 0 || sensor == null || sensor.getWidth() <= 0f) return 0;
        float focal = focals[0];
        for (float candidate : focals) focal = Math.min(focal, candidate);
        return focal * 36.0 / sensor.getWidth();
    }

    static final Comparator<Entry> DISPLAY_ORDER = (a, b) -> {
        int facing = facingRank(a.facing) - facingRank(b.facing);
        if (facing != 0) return facing;
        if (a.physical != b.physical) return a.physical ? 1 : -1;
        return a.id.compareTo(b.id);
    };

    private static int facingRank(String facing) {
        if ("back".equals(facing)) return 0;
        if ("front".equals(facing)) return 1;
        return 2;
    }
}
