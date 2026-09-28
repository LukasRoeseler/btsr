package de.lroeseler.omegasim;

import android.bluetooth.BluetoothGatt;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.PluginHandle;
import java.lang.reflect.Field;
import java.util.Map;
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
 * 5. BLUETOOTH BEIM SCHLIESSEN TRENNEN. GEMELDET: "Wenn ich die App schliesse und oeffne, zeigt
 *    das Auto an, es waere noch verbunden, ist es aber nicht. Und neu verbinden geht dann auch
 *    nicht." Das Plugin (@capacitor-community/bluetooth-le) schliesst seine GATT-Verbindungen
 *    nicht, wenn die Activity endet; der Prozess lebt weiter und mit ihm die Verbindung. Das
 *    Auto wirbt dann nicht mehr und ist fuer eine neue Suche unsichtbar. Das Plugin hat dafuer
 *    keinen Weg nach aussen, also per Reflexion: seine deviceMap, darin je Geraet das Feld
 *    bluetoothGatt - disconnect() und close(). Scheitert das (andere Plugin-Fassung), bleibt es
 *    beim alten Verhalten; die Web-Seite nimmt ein noch verbundenes Auto dann beim naechsten
 *    Verbinden direkt wieder auf (05-app-bruecke.js).
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

    @Override
    public void onDestroy() {
        bluetoothTrennen();
        super.onDestroy();
    }

    private void bluetoothTrennen() {
        try {
            PluginHandle h = getBridge() != null ? getBridge().getPlugin("BluetoothLe") : null;
            Object plugin = h != null ? h.getInstance() : null;
            if (plugin == null) return;
            Field karte = plugin.getClass().getDeclaredField("deviceMap");
            karte.setAccessible(true);
            Object m = karte.get(plugin);
            if (!(m instanceof Map)) return;
            for (Object geraet : ((Map<?, ?>) m).values()) {
                try {
                    Field f = geraet.getClass().getDeclaredField("bluetoothGatt");
                    f.setAccessible(true);
                    Object gatt = f.get(geraet);
                    if (gatt instanceof BluetoothGatt) {
                        ((BluetoothGatt) gatt).disconnect();
                        ((BluetoothGatt) gatt).close();
                    }
                } catch (Throwable e) { /* naechstes Geraet */ }
            }
        } catch (Throwable e) { /* andere Plugin-Fassung: nichts zu tun */ }
    }

    private void vollbild() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }
}
