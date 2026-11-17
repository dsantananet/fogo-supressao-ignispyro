package pt.ignispyro.fogosupressao;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.result.ActivityResult;
import androidx.core.location.LocationManagerCompat;
import androidx.core.os.CancellationSignal;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import java.io.IOException;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle state) {
        registerPlugin(DocumentFiles.class);
        registerPlugin(ReleaseUpdates.class);
        super.onCreate(state);
    }

    @CapacitorPlugin(name = "DocumentFiles", permissions = {
        @Permission(alias = "gps", strings = {
            Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION
        })
    })
    public static class DocumentFiles extends Plugin {
        private WebView printView;

        @PluginMethod
        public void locate(PluginCall call) {
            if (getPermissionState("gps") != PermissionState.GRANTED) {
                requestPermissionForAlias("gps", call, "locationPermission");
                return;
            }
            findLocation(call);
        }

        @PermissionCallback
        private void locationPermission(PluginCall call) {
            if (getPermissionState("gps") != PermissionState.GRANTED) {
                call.reject("Autoriza a localização precisa nas definições da aplicação.");
                return;
            }
            findLocation(call);
        }

        private void findLocation(PluginCall call) {
            getActivity().runOnUiThread(() -> {
                LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
                if (!manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    call.reject("Liga a localização do aparelho para usar o GPS.");
                    return;
                }
                Handler handler = new Handler(Looper.getMainLooper());
                CancellationSignal cancellation = new CancellationSignal();
                Runnable timeout = () -> {
                    cancellation.cancel();
                    call.reject("Sem posição GPS. Tenta novamente num local descoberto.");
                };
                try {
                    LocationManagerCompat.getCurrentLocation(manager, LocationManager.GPS_PROVIDER, cancellation,
                        handler::post, position -> {
                            if (cancellation.isCanceled()) return;
                            handler.removeCallbacks(timeout);
                            if (position == null) {
                                call.reject("Posição GPS indisponível.");
                                return;
                            }
                            JSObject coordinates = new JSObject();
                            coordinates.put("latitude", position.getLatitude());
                            coordinates.put("longitude", position.getLongitude());
                            coordinates.put("timestamp", position.getTime());
                            call.resolve(coordinates);
                        });
                    handler.postDelayed(timeout, 25000);
                } catch (SecurityException | IllegalArgumentException error) {
                    call.reject("GPS indisponível.", error);
                }
            });
        }

        @PluginMethod
        public void save(PluginCall call) {
            Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType(call.getString("mime", "application/octet-stream"));
            picker.putExtra(Intent.EXTRA_TITLE, call.getString("name", "registo"));
            startActivityForResult(call, picker, "writeDocument");
        }

        @ActivityCallback
        private void writeDocument(PluginCall call, ActivityResult result) {
            if (call == null) return;
            Intent data = result.getData();
            if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
                call.reject("Gravação cancelada");
                return;
            }

            try (OutputStream stream = getContext().getContentResolver().openOutputStream(data.getData())) {
                if (stream == null) throw new IOException("Destino indisponível");
                stream.write(Base64.decode(call.getString("base64", ""), Base64.DEFAULT));
            } catch (IOException | IllegalArgumentException | SecurityException error) {
                call.reject("Não foi possível gravar o ficheiro", error);
                return;
            }
            call.resolve();
        }

        @PluginMethod
        public void print(PluginCall call) {
            getActivity().runOnUiThread(() -> {
                printView = new WebView(getActivity());
                printView.getSettings().setBlockNetworkLoads(true);
                printView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        manager.print("Relatório de Fogo de Supressão", view.createPrintDocumentAdapter("Relatório de Supressão"), null);
                        call.resolve();
                    }
                });
                printView.loadDataWithBaseURL(null, call.getString("html", ""), "text/html", "UTF-8", null);
            });
        }
    }
}
