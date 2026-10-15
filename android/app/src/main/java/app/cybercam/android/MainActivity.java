package app.cybercam.android;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeviceCamerasPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
