package de.lroeseler.omegasim;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * DUALSENSE-TRIGGER UEBER USB AUF ANDROID (v1.5, WIP, Stufe 1: Pruefknopf).
 *
 * BESTELLT (Plan Paket 6): die adaptiven Trigger des DualSense auch in der Android-App, ueber das
 * USB-Kabel. Im Browser macht das WebHID (80b-dualsense.js); die WebView kennt WebHID nicht. Hier
 * schreibt die App den Ausgabebericht 0x02 (USB-Form, 63 Bytes) selbst ueber die USB-Host-API.
 *
 * UNGEPRUEFTES RISIKO: Android haelt die HID-Schnittstelle fuer den Gamepad-Treiber. claimInterface(force)
 * nimmt sie ihm weg; solange liefern die Tasten vermutlich keine Eingaben. Deshalb in Stufe 1 nur ein
 * TEST: Folge abspielen (je Schritt ein Bericht und eine Dauer), danach die Schnittstelle sofort wieder
 * freigeben. Der Nutzer berichtet, ob die Trigger reagiert haben und ob die Tasten danach noch gehen.
 *
 *   lage()              {host, gefunden, erlaubt, name}
 *   test({folge})       folge = [{bericht: Base64, ms}], liefert {ok, weg, protokoll}
 */
@CapacitorPlugin(name = "OmegaDsUsb")
public class OmegaDsUsbPlugin extends Plugin {

    private static final int SONY = 0x054C;
    private static final int[] PRODUKTE = { 0x0CE6, 0x0DF2 };   // DualSense, DualSense Edge
    private static final String AKTION = "de.lroeseler.omegasim.DS_USB_ERLAUBNIS";

    private static int hidNummer(UsbDevice d) {
        for (int i = 0; i < d.getInterfaceCount(); i++) if (d.getInterface(i).getInterfaceClass() == UsbConstants.USB_CLASS_HID) return d.getInterface(i).getId();
        return 3;
    }

    private UsbManager usb() { return (UsbManager) getContext().getSystemService(Context.USB_SERVICE); }

    private UsbDevice finden() {
        UsbManager m = usb();
        if (m == null) return null;
        for (UsbDevice d : m.getDeviceList().values()) {
            if (d.getVendorId() != SONY) continue;
            for (int p : PRODUKTE) if (d.getProductId() == p) return d;
        }
        return null;
    }

    @PluginMethod
    public void lage(PluginCall call) {
        JSObject r = new JSObject();
        r.put("host", getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_USB_HOST));
        UsbDevice d = finden();
        r.put("gefunden", d != null);
        r.put("erlaubt", d != null && usb().hasPermission(d));
        r.put("name", d != null ? (d.getProductName() != null ? d.getProductName() : "DualSense") : "");
        call.resolve(r);
    }

    @PluginMethod
    public void test(PluginCall call) {
        final List<byte[]> berichte = new ArrayList<>();
        final List<Integer> dauern = new ArrayList<>();
        try {
            JSONArray folge = call.getArray("folge");
            for (int i = 0; folge != null && i < folge.length(); i++) {
                JSONObject s = folge.getJSONObject(i);
                berichte.add(Base64.decode(s.getString("bericht"), Base64.DEFAULT));
                dauern.add(Math.max(0, Math.min(10000, s.optInt("ms", 0))));
            }
        } catch (Exception e) {
            call.reject("Folge unlesbar: " + e.getMessage());
            return;
        }
        if (berichte.isEmpty()) { call.reject("Folge leer"); return; }
        final UsbDevice d = finden();
        if (d == null) {
            // v1.5: statt nur eines Fehlers die Liste der USB-Geraete, damit sich sehen laesst, was Android meldet.
            StringBuilder p = new StringBuilder("Kein DualSense am USB-Kabel gefunden.\nUSB-Geraete:");
            UsbManager m = usb();
            if (m == null) p.append(" (kein USB-Host)");
            else for (UsbDevice x : m.getDeviceList().values()) p.append("\n  ").append(String.format("%04x:%04x", x.getVendorId(), x.getProductId())).append(" ").append(x.getProductName());
            antwort(call, false, "", p.toString());
            return;
        }
        if (usb().hasPermission(d)) { abspielen(call, d, berichte, dauern); return; }
        // Erlaubnis erfragen: das System zeigt einen Dialog und meldet das Ergebnis per Broadcast.
        final Context ctx = getContext();
        BroadcastReceiver empfaenger = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                try { ctx.unregisterReceiver(this); } catch (Exception e) { /* schon weg */ }
                boolean ja = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                if (!ja) { antwort(call, false, "", "USB-Zugriff nicht erlaubt (Dialog abgelehnt oder geschlossen)."); return; }
                abspielen(call, d, berichte, dauern);
            }
        };
        ContextCompat.registerReceiver(ctx, empfaenger, new IntentFilter(AKTION), ContextCompat.RECEIVER_NOT_EXPORTED);
        Intent absicht = new Intent(AKTION).setPackage(ctx.getPackageName());
        int flags = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
        usb().requestPermission(d, PendingIntent.getBroadcast(ctx, 0, absicht, flags));
    }

    private static void antwort(PluginCall call, boolean ok, String weg, String protokoll) {
        JSObject r = new JSObject();
        r.put("ok", ok);
        r.put("weg", weg);
        r.put("protokoll", protokoll);
        call.resolve(r);
    }

    private void abspielen(final PluginCall call, final UsbDevice d, final List<byte[]> berichte, final List<Integer> dauern) {
        new Thread(() -> {
            StringBuilder p = new StringBuilder();
            UsbDeviceConnection c = null;
            UsbInterface hid = null;
            String weg = "";
            boolean ok = false;
            try {
                p.append(d.getProductName()).append(" ").append(String.format("%04x:%04x", d.getVendorId(), d.getProductId()))
                 .append(", ").append(d.getInterfaceCount()).append(" Schnittstellen\n");
                for (int i = 0; i < d.getInterfaceCount(); i++) {
                    UsbInterface f = d.getInterface(i);
                    p.append("  #").append(f.getId()).append(" Klasse ").append(f.getInterfaceClass())
                     .append(", ").append(f.getEndpointCount()).append(" Endpunkte\n");
                    if (hid == null && f.getInterfaceClass() == UsbConstants.USB_CLASS_HID) hid = f;
                }
                if (hid == null) throw new Exception("keine HID-Schnittstelle");
                UsbEndpoint aus = null;
                for (int i = 0; i < hid.getEndpointCount(); i++) {
                    UsbEndpoint e = hid.getEndpoint(i);
                    if (e.getDirection() == UsbConstants.USB_DIR_OUT && e.getType() == UsbConstants.USB_ENDPOINT_XFER_INT) aus = e;
                }
                c = usb().openDevice(d);
                if (c == null) throw new Exception("openDevice fehlgeschlagen");
                boolean belegt = c.claimInterface(hid, true);
                p.append("Android ").append(Build.VERSION.RELEASE).append(" (API ").append(Build.VERSION.SDK_INT).append("), claimInterface: ").append(belegt)
                 .append(", OUT-Endpunkt: ").append(aus != null).append("\n");
                // v1.5: GEMELDET "Damit sie reagieren, musste er erst per Bluetooth und dann Kabel verbunden sein." Vermutlich
                // haelt Android's Gamepad-Treiber die Schnittstelle, wenn der Controller nur am Kabel haengt. Dann trotzdem
                // ueber den Steuerkanal (SET_REPORT, Endpunkt 0), der keine belegte Schnittstelle braucht.
                if (!belegt) { hid = null; p.append("Schnittstelle nicht belegbar: Versuch ueber den Steuerkanal ohne Belegen\n"); }
                final int hidId = hidNummer(d);
                for (int i = 0; i < berichte.size(); i++) {
                    byte[] b = berichte.get(i);
                    int n = -1;
                    if (aus != null && belegt) { n = c.bulkTransfer(aus, b, b.length, 200); weg = "interrupt"; }
                    if (n < 0) {
                        // SET_REPORT (Ausgabe, Bericht 0x02) ueber den Steuerkanal.
                        n = c.controlTransfer(0x21, 0x09, 0x0200 | (b[0] & 0xff), hidId, b, b.length, 200);
                        weg = belegt ? "control" : "control ohne Belegen";
                    }
                    p.append("Schritt ").append(i + 1).append(": ").append(n).append(" Bytes (").append(weg).append(")\n");
                    if (n < 0) throw new Exception("Senden fehlgeschlagen");
                    Thread.sleep(dauern.get(i));
                }
                ok = true;
            } catch (Exception e) {
                p.append("Fehler: ").append(e.getMessage()).append("\n");
            } finally {
                if (c != null) {
                    if (hid != null) { try { c.releaseInterface(hid); } catch (Exception e) { /* weg */ } }
                    try { c.close(); } catch (Exception e) { /* weg */ }
                    p.append("Schnittstelle freigegeben\n");
                }
            }
            JSObject r = new JSObject();
            r.put("ok", ok);
            r.put("weg", weg);
            r.put("protokoll", p.toString());
            call.resolve(r);
        }, "omega-ds-usb").start();
    }
}
