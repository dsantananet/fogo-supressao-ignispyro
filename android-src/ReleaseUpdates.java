package pt.ignispyro.fogosupressao;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ReleaseUpdates")
public class ReleaseUpdates extends Plugin {
    @PluginMethod
    public void version(PluginCall call) {
        try {
            String version = getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0).versionName;
            JSObject result = new JSObject();
            result.put("version", version);
            call.resolve(result);
        } catch (PackageManager.NameNotFoundException error) {
            call.reject("Versão indisponível", error);
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        String tag = call.getString("tag", "");
        if (!tag.matches("v[0-9]+\\.[0-9]+\\.[0-9]+")) {
            call.reject("Versão inválida");
            return;
        }
        Uri uri = Uri.parse("https://github.com/dsantananet/fogo-supressao-ignispyro/releases/download/"
                + tag + "/Fogo-Supressao-IgnisPyro-" + tag + ".apk");
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri));
                call.resolve();
            } catch (android.content.ActivityNotFoundException error) {
                call.reject("Navegador indisponível", error);
            }
        });
    }
}
