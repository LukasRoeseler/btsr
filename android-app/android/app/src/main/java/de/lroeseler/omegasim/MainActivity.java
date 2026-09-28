package de.lroeseler.omegasim;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

/**
 * Die Huelle um index.html. Drei Dinge passieren hier, alle vor dem ersten Laden der Seite:
 *
 * 1. RUECKFALL einer Aktualisierung, die nie bestaetigt wurde (siehe OmegaUpdatePlugin):
 *    eine neue Web-Fassung, die beim letzten Lauf nicht bis zu bestaetigen() kam, wird
 *    verworfen - sonst koennte ein kaputter Push die App dauerhaft unbrauchbar machen.
 * 2. Die zwei eigenen Plugins anmelden. Das Bluetooth-Plugin meldet sich selbst an.
 * 3. Bildschirm an lassen: waehrend eines Rennens darf das Telefon nicht einschlafen, und ein
 *    Info-Screen auf dem Tablet schon gar nicht.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        OmegaUpdatePlugin.beimStart(this);
        registerPlugin(OmegaUpdatePlugin.class);
        registerPlugin(OmegaHostPlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
