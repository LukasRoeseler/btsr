package de.lroeseler.omegasim;

import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothStatusCodes;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.reflect.Field;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * SCHNELLER STEUER-SCHREIBWEG, ohne den Umweg ueber das Community-Plugin.
 *
 * GEMELDET (nur in der App): "auf meinem schwaecheren Handy ist die Verzoegerung sehr gross".
 * Zwei Quellen stecken dahinter, und beide wuergen den Steuertakt:
 *
 *   1. writeWithoutResponse des Community-Plugins wartet auf onCharacteristicWrite (GATT-
 *      Bestaetigung), BEVOR es das JS-Promise aufloest. Ein Steuerbefehl haengt also am
 *      Rundlauf JS <-> nativ <-> GATT <-> nativ <-> JS.
 *   2. Die Web-Seite wartet auf diesen Rundlauf. Ist er laenger als der 45-ms-Takt, laufen die
 *      Steuerbefehle auf - und das Fahren fuehlt sich traege an.
 *
 * Dieses Plugin trennt beides:
 *   - writeControl() loest SOFORT auf (fire-and-forget). Der Bridge-Rundlauf bleibt, aber er
 *     haelt den Steuertakt nicht mehr auf.
 *   - Der eigentliche GATT-Write laeuft auf einem eigenen Hintergrund-Thread (HandlerThread),
 *     nicht auf dem UI-Thread, auf dem die WebView zeichnet. Jede Malarbeit vor dem Senden
 *     verzoegert dort sonst die Bluetooth-Antworten.
 *   - Schreiben sind serialisiert und "letzter gewinnt": kommt waehrend eines Write ein neuer
 *     Befehl, wird der naechste geschrieben; der aeltere faellt weg. Bei WRITE_TYPE_NO_RESPONSE
 *     ist das richtig, weil jedes Steuerpaket das vorherige ersetzt.
 *
 * DIE VERBINDUNG LEIHEN wir uns vom Community-Plugin: es haelt die GATT-Verbindung (deviceMap ->
 * bluetoothGatt). Dasselbe tut MainActivity.bluetoothTrennen() per Reflexion. Scheitert die
 * Reflexion (andere Plugin-Fassung), faellt die Web-Seite auf das Community-Plugin zurueck.
 */
@CapacitorPlugin(name = "OmegaBle")
public class OmegaBlePlugin extends Plugin {

    private final Map<String, byte[]> neueste = new ConcurrentHashMap<>();
    private final Map<String, String[]> ziele = new ConcurrentHashMap<>();
    private final Map<String, Long> gen = new ConcurrentHashMap<>();
    private final Map<String, Boolean> schreibt = new ConcurrentHashMap<>();
    private HandlerThread writeThread;
    private Handler writeHandler;

    @Override
    public void load() {
        writeThread = new HandlerThread("OmegaBle-Write");
        writeThread.start();
        writeHandler = new Handler(writeThread.getLooper());
    }

    @PluginMethod
    public void writeControl(PluginCall call) {
        String deviceId = call.getString("deviceId");
        String service = call.getString("service");
        String characteristic = call.getString("characteristic");
        String value = call.getString("value");
        if (deviceId == null || service == null || characteristic == null || value == null) {
            call.reject("deviceId, service, characteristic und value sind erforderlich.");
            return;
        }
        ziele.put(deviceId, new String[]{service, characteristic});
        neueste.put(deviceId, hexZuBytes(value));
        gen.put(deviceId, System.nanoTime());
        if (schreibt.putIfAbsent(deviceId, true) == null) {
            writeHandler.post(() -> schreibe(deviceId));
        }
        // Fire-and-forget: sofort aufloesen, nicht auf das GATT-Schreiben warten.
        call.resolve();
    }

    /** Schreiben auf dem Hintergrund-Thread, serialisiert, "letzter gewinnt". */
    private void schreibe(String deviceId) {
        try {
            byte[] wert = neueste.get(deviceId);
            long g = gen.getOrDefault(deviceId, 0L);
            if (wert != null) {
                String[] ziel = ziele.get(deviceId);
                BluetoothGatt gatt = findeGatt(deviceId);
                if (gatt != null && ziel != null) {
                    BluetoothGattService s = gatt.getService(UUID.fromString(ziel[0]));
                    BluetoothGattCharacteristic c = s != null
                        ? s.getCharacteristic(UUID.fromString(ziel[1])) : null;
                    if (c != null) schreibeGatt(gatt, c, wert);
                }
            }
            // Kam waehrend des Write ein neuer Befehl, den naechsten schreiben; sonst frei.
            if (gen.getOrDefault(deviceId, 0L) != g) {
                writeHandler.post(() -> schreibe(deviceId));
            } else {
                schreibt.remove(deviceId);
            }
        } catch (Throwable e) {
            schreibt.remove(deviceId);
        }
    }

    private static void schreibeGatt(BluetoothGatt gatt, BluetoothGattCharacteristic c, byte[] bytes) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            gatt.writeCharacteristic(c, bytes, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
        } else {
            c.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
            c.setValue(bytes);
            gatt.writeCharacteristic(c);
        }
    }

    /** Die GATT-Verbindung aus dem Community-Plugin holen (deviceMap -> bluetoothGatt). */
    private BluetoothGatt findeGatt(String deviceId) {
        try {
            PluginHandle h = getBridge().getPlugin("BluetoothLe");
            if (h == null) return null;
            Object plugin = h.getInstance();
            if (plugin == null) return null;
            Field karte = plugin.getClass().getDeclaredField("deviceMap");
            karte.setAccessible(true);
            Object m = karte.get(plugin);
            if (!(m instanceof Map)) return null;
            Object geraet = ((Map<?, ?>) m).get(deviceId);
            if (geraet == null) return null;
            Field f = geraet.getClass().getDeclaredField("bluetoothGatt");
            f.setAccessible(true);
            Object gatt = f.get(geraet);
            return gatt instanceof BluetoothGatt ? (BluetoothGatt) gatt : null;
        } catch (Throwable e) {
            return null;
        }
    }

    private static byte[] hexZuBytes(String hex) {
        int len = hex.length();
        byte[] out = new byte[len / 2];
        for (int i = 0; i < out.length; i++) {
            int hi = Character.digit(hex.charAt(i * 2), 16);
            int lo = Character.digit(hex.charAt(i * 2 + 1), 16);
            out[i] = (byte) ((hi << 4) | lo);
        }
        return out;
    }

    @Override
    protected void handleOnDestroy() {
        if (writeThread != null) {
            writeThread.quitSafely();
            writeThread = null;
            writeHandler = null;
        }
    }
}
