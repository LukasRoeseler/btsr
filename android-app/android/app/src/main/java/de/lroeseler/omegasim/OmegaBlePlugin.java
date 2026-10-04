package de.lroeseler.omegasim;

import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothStatusCodes;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.reflect.Field;
import java.util.Map;
import java.util.UUID;

/**
 * SCHNELLER STEUER-SCHREIBWEG, ohne den Umweg ueber das Community-Plugin.
 *
 * GEMELDET (nur in der App): "auf meinem schwaecheren Handy ist die Verzoegerung sehr gross".
 * Der Grund ist der Rundlauf je Steuerbefehl: writeWithoutResponse des Community-Plugins
 * registriert einen Callback, ruft writeCharacteristic und wartet DANN auf onCharacteristicWrite,
 * bevor es das JS-Promise aufloest. Dazu kommt der Bridge-Rundlauf JS <-> nativ. Beides zusammen
 * ist die konstante kleine Verzoegerung, die jeder Lenk- und Gaseingabe anhaengt.
 *
 * Dieses Plugin schreibt direkt und loest SOFORT auf (fire-and-forget): writeCharacteristic mit
 * WRITE_TYPE_NO_RESPONSE wartet nicht auf eine Antwort, und wir warten auch nicht auf den
 * Callback. Der naechste Steuerbefehl kann damit sofort abgeschickt werden, ohne auf die
 * Bestaetigung des vorherigen zu warten. Bei WRITE_TYPE_NO_RESPONSE geht kein Paket verloren,
 * weil jedes Steuerpaket das vorherige ersetzt - die Physik laeuft im Takt.
 *
 * DIE VERBINDUNG LEIHEN wir uns vom Community-Plugin: es haelt die GATT-Verbindung (deviceMap ->
 * bluetoothGatt). Dasselbe tut MainActivity.bluetoothTrennen() per Reflexion. Scheitert die
 * Reflexion (andere Plugin-Fassung), fällt die Web-Seite auf das Community-Plugin zurueck.
 */
@CapacitorPlugin(name = "OmegaBle")
public class OmegaBlePlugin extends Plugin {

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
        try {
            BluetoothGatt gatt = findeGatt(deviceId);
            if (gatt == null) {
                call.reject("Nicht verbunden.");
                return;
            }
            BluetoothGattService s = gatt.getService(UUID.fromString(service));
            if (s == null) {
                call.reject("Dienst nicht gefunden.");
                return;
            }
            BluetoothGattCharacteristic c = s.getCharacteristic(UUID.fromString(characteristic));
            if (c == null) {
                call.reject("Merkmal nicht gefunden.");
                return;
            }
            byte[] bytes = hexZuBytes(value);
            boolean ok;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                int status = gatt.writeCharacteristic(
                    c, bytes, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                ok = status == BluetoothStatusCodes.SUCCESS;
            } else {
                c.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                c.setValue(bytes);
                ok = gatt.writeCharacteristic(c);
            }
            if (!ok) {
                call.reject("Schreiben fehlgeschlagen.");
                return;
            }
            // Fire-and-forget: nicht auf onCharacteristicWrite warten.
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
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
}
