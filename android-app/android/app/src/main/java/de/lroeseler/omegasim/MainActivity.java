package de.lroeseler.omegasim;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Die Huelle um index.html. Vor dem ersten Laden der Seite:
 *
 * 1. RUECKFALL einer Aktualisierung, die nie bestaetigt wurde (siehe OmegaUpdatePlugin).
 * 2. Die zwei eigenen Plugins anmelden. Das Bluetooth-Plugin meldet sich selbst an.
 * 3. Bildschirm an lassen: waehrend eines Rennens darf das Telefon nicht einschlafen.
 * 4. VOLLBILD. BESTELLT: "Vollbild nutzen - aktuell ist ein grauer Rand überall drumherum mit
 *    den Zurücktasten, menü, Zeit und Batteriestand usw." Statusleiste und Navigationsleiste
 *    verschwinden (immersiv); ein Wischen vom Rand holt sie kurz zurueck. Die Seite reicht
 *    bis unter die Kamera-Aussparung - der graue Rand war das Polster, das Capacitor fuer
 *    die Leisten und die Aussparung um die WebView legte. Die Web-App haelt mit
 *    env(safe-area-inset-*) selbst Abstand, wo es noetig ist (viewport-fit=cover).
 *    Nach jedem Fokuswechsel (Bluetooth-Auswahl, Benachrichtigung) wieder verstecken:
 *    Android zeigt die Leisten dabei von selbst wieder an.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        OmegaUpdatePlugin.beimStart(this);
        registerPlugin(OmegaUpdatePlugin.class);
        registerPlugin(OmegaHostPlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        vollbild();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) vollbild();
    }

    @Override
    public void onResume() {
        super.onResume();
        vollbild();
    }

    private void vollbild() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }
}
