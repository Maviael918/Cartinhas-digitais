package br.com.racker;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.SSLHandshakeException;

final class Telemetry {
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("racker", Context.MODE_PRIVATE); }

    static boolean resetDifferentServer(Context c) {
        SharedPreferences p = prefs(c);
        if (p.getString("token", "").isEmpty()) return false;
        String previous = p.getString("url", "").replaceAll("/+$", "");
        if (BuildConfig.RACKER_SERVER_URL.equals(previous)) return false;
        p.edit().clear().putString("error", "O painel desta versão já está configurado. Faça um novo pareamento para autorizar o envio ao painel online.").commit();
        return true;
    }

    static String validateUrl(String value) throws Exception {
        URI uri = new URI(value.trim());
        String host = uri.getHost();
        if (host == null || uri.getUserInfo() != null || uri.getRawQuery() != null || uri.getFragment() != null
                || (uri.getPath() != null && !uri.getPath().isEmpty() && !uri.getPath().equals("/"))) {
            throw new Exception("Informe somente a origem do servidor, como https://racker.seudominio.com");
        }
        if (host.endsWith(".supabase.co")) throw new Exception("Informe a URL do painel Racker. A URL do Supabase é usada somente pelo servidor.");
        boolean local = host.equals("localhost") || host.equals("127.0.0.1");
        String[] parts = host.split("\\.");
        if (parts.length == 4) {
            try {
                int[] ip = new int[4];
                for (int i=0;i<4;i++) { ip[i]=Integer.parseInt(parts[i]);if(ip[i]<0||ip[i]>255)throw new NumberFormatException(); }
                local = local || ip[0]==10 || (ip[0]==192&&ip[1]==168) || (ip[0]==172&&ip[1]>=16&&ip[1]<=31);
            } catch (NumberFormatException ignored) { }
        }
        if (!"https".equals(uri.getScheme()) && !(BuildConfig.DEBUG && local && "http".equals(uri.getScheme()))) {
            throw new Exception("Use HTTPS com certificado válido. HTTP local é permitido apenas no APK de desenvolvimento.");
        }
        return value.trim().replaceAll("/+$", "");
    }

    static JSONObject post(String base, String endpoint, JSONObject body, String token) throws Exception {
        return request(base, endpoint, body, token);
    }

    static JSONObject checkServer(String base) throws Exception {
        JSONObject health = request(base, "/health", null, null);
        if (!health.optBoolean("ok", false) || !"racker".equals(health.optString("service")) || health.optInt("apiVersion",0)!=1) {
            throw new Exception("Este endereço não retornou uma API Racker compatível. Publique a versão atual do servidor.");
        }
        return health;
    }

    private static JSONObject request(String base, String endpoint, JSONObject body, String token) throws Exception {
        validateUrl(base);
        HttpURLConnection conn = (HttpURLConnection) URI.create(base + endpoint).toURL().openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(15000);
        conn.setRequestMethod(body==null?"GET":"POST");
        conn.setRequestProperty("Accept", "application/json");
        if(body!=null)conn.setRequestProperty("Content-Type", "application/json");
        if (token != null) conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setDoOutput(body!=null);
        try {
            if(body!=null)try (var out = conn.getOutputStream()) { out.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            int status = conn.getResponseCode();
            if(status==404)throw new Exception("A API Racker não está publicada neste endereço (HTTP 404). Publique o servidor e as funções no Netlify.");
            if(status>=300&&status<400)throw new Exception("O servidor redirecionou a conexão. Informe a URL HTTPS final do painel Racker.");
            String text;
            InputStream stream = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (stream == null) text = "{}";
            else try (stream; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[1024]; int count;
                while ((count = stream.read(buffer)) != -1) {
                    if (bytes.size() + count > 16384) throw new Exception("Resposta do servidor muito grande.");
                    bytes.write(buffer,0,count);
                }
                text = bytes.toString(StandardCharsets.UTF_8.name());
            }
            if (status == 401 && token != null) throw new RevokedException();
            JSONObject json;
            try { json = new JSONObject(text); }
            catch (Exception error) { throw new Exception("O endereço retornou uma página em vez da API Racker. Verifique se as funções do servidor foram publicadas."); }
            if (status >= 300) throw new Exception(json.optString("error", "Servidor retornou HTTP " + status));
            return json;
        } catch(UnknownHostException e) { throw new Exception("Servidor não encontrado. Confira a URL e a conexão com a internet."); }
        catch(ConnectException e) { throw new Exception("Conexão recusada. Confira se o servidor está ligado e acessível ao celular. No celular, 127.0.0.1 não aponta para o computador."); }
        catch(SocketTimeoutException e) { throw new Exception("O servidor demorou a responder. Verifique a rede e tente novamente."); }
        catch(SSLHandshakeException e) { throw new Exception("Não foi possível validar o certificado HTTPS do servidor. Use um endereço com certificado válido."); }
        finally { conn.disconnect(); }
    }

    static JSONObject collect(Context c) throws Exception {
        Intent b = c.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int level = b == null ? -1 : b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = b == null ? -1 : b.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        int status = b == null ? -1 : b.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        ConnectivityManager cm = (ConnectivityManager)c.getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        String network = caps == null ? "offline" : caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ? "wifi"
                : caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ? "cellular"
                : caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ? "ethernet" : "other";
        return new JSONObject().put("battery", level >= 0 && scale > 0 ? Math.round(level * 100f / scale) : JSONObject.NULL)
                .put("charging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL)
                .put("network", network).put("androidVersion", Build.VERSION.RELEASE);
    }

    static boolean send(Context c, JSONObject location) throws Exception {
        if (resetDifferentServer(c)) return false;
        SharedPreferences p = prefs(c);
        if (!p.getBoolean("active", false) || p.getString("token", "").isEmpty()) return false;
        JSONObject body = collect(c);
        if (location != null) body.put("location", location);
        if (!p.getBoolean("active", false)) return false;
        try {
            JSONObject ack=post(BuildConfig.RACKER_SERVER_URL, "/api/telemetry", body, p.getString("token", ""));
            if(!ack.optBoolean("ok",false) || ack.optLong("receivedAt",0)<=0)throw new Exception("O servidor não confirmou o recebimento. Nenhuma sincronização foi registrada no aplicativo.");
            p.edit().putLong("lastSync", System.currentTimeMillis()).remove("error").apply();
            return true;
        } catch (RevokedException ex) {
            p.edit().putBoolean("active", false).remove("token").putString("error", "Vínculo revogado. Faça um novo pareamento.").commit();
            throw ex;
        }
    }
    static class RevokedException extends Exception { RevokedException() { super("Vínculo revogado. Faça um novo pareamento."); } }
}
