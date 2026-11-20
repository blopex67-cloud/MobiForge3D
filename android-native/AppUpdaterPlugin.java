package com.blopex.mobiforge3d;

import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    @PluginMethod
    public void install(PluginCall call) {
        final String address = call.getString("url");
        if (address == null || !address.startsWith("https://github.com/")) {
            call.reject("La actualización no tiene una URL segura de GitHub.");
            return;
        }
        if (android.os.Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(settings);
            call.reject("Permite instalar actualizaciones para MobiForge y vuelve a pulsar el icono de actualización.");
            return;
        }
        new Thread(() -> {
            File apk = null;
            try {
                URL url = new URL(address);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.connect();
                String host = connection.getURL().getHost();
                if (!(host.equals("github.com") || host.endsWith(".githubusercontent.com"))) {
                    throw new SecurityException("Host de descarga no permitido");
                }
                int length = connection.getContentLength();
                if (length > 250 * 1024 * 1024) throw new IllegalArgumentException("APK demasiado grande");
                File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) throw new IllegalStateException("No hay almacenamiento disponible");
                apk = new File(dir, "mobiforge-update.apk");
                try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buffer = new byte[32768];
                    int n; long total = 0;
                    while ((n = in.read(buffer)) != -1) {
                        total += n;
                        if (total > 250L * 1024 * 1024) throw new IllegalArgumentException("APK demasiado grande");
                        out.write(buffer, 0, n);
                    }
                } finally { connection.disconnect(); }
                if (apk.length() < 100000) throw new IllegalStateException("La descarga del APK quedó incompleta");
                final File ready = apk;
                getActivity().runOnUiThread(() -> {
                    try {
                        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", ready);
                        Intent install = new Intent(Intent.ACTION_VIEW);
                        install.setDataAndType(uri, "application/vnd.android.package-archive");
                        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                        getActivity().startActivity(install);
                        call.resolve();
                    } catch (Exception e) { call.reject("Android no pudo abrir el instalador: " + e.getMessage()); }
                });
            } catch (Exception e) {
                if (apk != null) apk.delete();
                call.reject("No se pudo descargar la actualización: " + e.getMessage());
            }
        }, "MobiForgeUpdater").start();
    }
}
