package br.com.racker;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.View;
import android.widget.*;
import androidx.work.*;
import org.json.JSONObject;
import java.text.DateFormat;
import java.util.Date;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity {
    private LinearLayout column;
    private SharedPreferences prefs;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private CancellationSignal locationCancellation;
    private boolean visible;
    private boolean waitingForPermission;
    private boolean screenPaired;
    private CheckBox shareLocation;
    private Button syncButton;
    private static final String WORK = "racker-periodic";

    @Override public void onCreate(Bundle savedInstanceState) { super.onCreate(savedInstanceState); prefs = Telemetry.prefs(this); draw(); }
    @Override public void onResume() {
        super.onResume(); visible = true;
        boolean paired=!prefs.getString("token", "").isEmpty();
        if(!waitingForPermission&&(paired||paired!=screenPaired))draw();
    }
    @Override public void onPause() { visible = false; if (locationCancellation != null) locationCancellation.cancel(); super.onPause(); }
    @Override public void onDestroy() { if (locationCancellation != null) locationCancellation.cancel(); io.shutdown(); super.onDestroy(); }

    private TextView text(String value, int size, String color) {
        TextView t = new TextView(this); t.setText(value); t.setTextSize(size); t.setTextColor(Color.parseColor(color));
        t.setPadding(0, 12, 0, 12); t.setLineSpacing(4, 1); column.addView(t); return t;
    }
    private EditText input(String hint, String value, int type) {
        EditText e = new EditText(this); e.setHint(hint); e.setText(value); e.setTextSize(15); e.setSingleLine(true); e.setInputType(type); column.addView(e); return e;
    }
    private Button button(String title, View.OnClickListener action) {
        Button b = new Button(this); b.setText(title); b.setAllCaps(false); column.addView(b); b.setOnClickListener(action); return b;
    }
    private void draw() {
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(Color.rgb(247,248,245));
        column = new LinearLayout(this); column.setOrientation(LinearLayout.VERTICAL);
        int padding = (int)(26 * getResources().getDisplayMetrics().density); column.setPadding(padding,padding,padding,padding);
        scroll.addView(column); setContentView(scroll);
        text("racker.", 36, "#405D30"); text("Seu Android, por perto.", 23, "#34452A");
        text("Compartilhamento autorizado de bateria, conexão e, se você escolher, localização. O app não lê conversas, fotos ou senhas.", 14, "#879577");
        screenPaired=!prefs.getString("token", "").isEmpty();
        if (!screenPaired) pairingScreen(); else connectedScreen();
    }
    private void pairingScreen() {
        text("Conectar ao painel", 19, "#405D30");
        text("Gere um código no painel web. Informe a URL do seu servidor Racker, não a URL da demonstração.", 13, "#879577");
        EditText url = input("https://racker.seudominio.com", prefs.getString("url", ""), InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI);
        TextView serverStatus=text("Teste o endereço antes de informar o código de pareamento.",12,"#879577");
        button("Testar conexão com o servidor", v -> {
            String address;
            try { address=Telemetry.validateUrl(url.getText().toString()); } catch(Exception e) { message(e.getMessage());return; }
            v.setEnabled(false);
            io.execute(() -> {
                try { JSONObject health=Telemetry.checkServer(address);runOnUiThread(() -> { v.setEnabled(true);serverStatus.setTextColor(Color.parseColor("#60833D"));serverStatus.setText("Servidor Racker conectado. Banco: "+health.optString("storage","não informado")); }); }
                catch(Exception e) { runOnUiThread(() -> { v.setEnabled(true);serverStatus.setTextColor(Color.parseColor("#A26654"));serverStatus.setText(e.getMessage()); }); }
            });
        });
        EditText code = input("Código de 8 dígitos", "", InputType.TYPE_CLASS_NUMBER);
        EditText name = input("Nome do aparelho", Build.MODEL, InputType.TYPE_CLASS_TEXT);
        CheckBox consent = new CheckBox(this); consent.setText("Autorizo enviar a bateria e o tipo de conexão deste aparelho ao meu painel. Posso pausar ou remover o vínculo."); consent.setTextSize(13); column.addView(consent);
        button("Conectar meu Android", v -> {
            if (!consent.isChecked()) { message("Confirme o compartilhamento antes de conectar."); return; }
            String address;
            try { address = Telemetry.validateUrl(url.getText().toString()); } catch(Exception e) { message(e.getMessage()); return; }
            String pairingCode=code.getText().toString().trim(), deviceName=name.getText().toString().trim();
            if(!pairingCode.matches("[0-9]{8}") || deviceName.isEmpty()) { message("Informe o código de 8 dígitos e o nome do aparelho."); return; }
            v.setEnabled(false);
            io.execute(() -> {
                try {
                    Telemetry.checkServer(address);
                    JSONObject request = new JSONObject().put("code",pairingCode).put("name",deviceName).put("model",Build.MANUFACTURER+" "+Build.MODEL).put("consent",true);
                    JSONObject result=Telemetry.post(address,"/api/pair",request,null);
                    prefs.edit().putString("url",address).putString("token",result.getString("token")).putString("id",result.getString("id")).putBoolean("active",true).remove("error").commit();
                    schedule(); Telemetry.send(this,null);
                    runOnUiThread(() -> { if(!isFinishing()) { draw();message("Android conectado. Compartilhamento ativo."); } });
                } catch(Exception e) { runOnUiThread(() -> { v.setEnabled(true);serverStatus.setTextColor(Color.parseColor("#A26654"));serverStatus.setText(e.getMessage());message(e.getMessage()); if(!prefs.getString("token", "").isEmpty())draw(); }); }
            });
        });
        text(prefs.getString("error", ""), 12, "#A26654");
    }
    private void connectedScreen() {
        boolean active=prefs.getBoolean("active",false);
        text(active?"● Compartilhamento ativo":"○ Compartilhamento pausado",18,active?"#60833D":"#929B86");
        text("Servidor: "+prefs.getString("url",""),12,"#8D9B7C");
        long last=prefs.getLong("lastSync",0);
        text(last==0?"Aguardando primeiro envio":"Último envio: "+DateFormat.getDateTimeInstance().format(new Date(last)),13,"#7A8D65");
        text("Envios automáticos de bateria e rede: a cada ~15 minutos. Economia de bateria e regras do Android podem atrasar os envios. Localização nunca é coletada por essa tarefa.",13,"#879577");
        shareLocation=new CheckBox(this); shareLocation.setText("Compartilhar localização aproximada no próximo envio manual"); shareLocation.setTextSize(13); column.addView(shareLocation);
        syncButton=button("Sincronizar agora",v -> sync()); syncButton.setEnabled(active);
        button(active?"Pausar envios":"Retomar envios",v -> {
            if(active) { prefs.edit().putBoolean("active",false).commit(); WorkManager.getInstance(this).cancelUniqueWork(WORK); if(locationCancellation!=null)locationCancellation.cancel(); }
            else { prefs.edit().putBoolean("active",true).commit(); schedule(); }
            draw();
        });
        button("Esquecer vínculo neste Android",v -> new AlertDialog.Builder(this).setTitle("Esquecer vínculo local?")
                .setMessage("Os envios serão interrompidos. Para apagar os dados já enviados e revogar o token no servidor, remova também o aparelho pelo painel web.")
                .setNegativeButton("Cancelar",null).setPositiveButton("Esquecer",(d,w)-> {
                    if(locationCancellation!=null)locationCancellation.cancel(); prefs.edit().clear().commit(); WorkManager.getInstance(this).cancelUniqueWork(WORK); draw();
                }).show());
        text(prefs.getString("error",""),12,"#A26654");
    }
    private void schedule() {
        Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest request=new PeriodicWorkRequest.Builder(SyncWorker.class,15,TimeUnit.MINUTES).setConstraints(constraints).build();
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(WORK,ExistingPeriodicWorkPolicy.UPDATE,request);
    }
    private void sync() {
        if(!visible||!prefs.getBoolean("active",false))return;
        if(!shareLocation.isChecked()) { send(null);return; }
        if(checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED) {
            waitingForPermission=true;
            requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION},17); return;
        }
        syncButton.setEnabled(false);
        LocationManager manager=(LocationManager)getSystemService(LOCATION_SERVICE);
        try {
            if(!manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) { message("Localização aproximada indisponível. Enviando somente bateria e rede."); send(null);return; }
            locationCancellation=new CancellationSignal();
            CancellationSignal cancellation=locationCancellation;
            handler.postDelayed(() -> {
                if(!cancellation.isCanceled()) {
                    cancellation.cancel();
                    if(visible&&prefs.getBoolean("active",false)) { message("Localização não respondeu a tempo. Enviando bateria e rede.");send(null); }
                }
            },20000);
            manager.getCurrentLocation(LocationManager.NETWORK_PROVIDER,cancellation,getMainExecutor(),location -> {
                if(!visible||!prefs.getBoolean("active",false))return;
                cancellation.cancel();
                try {
                    JSONObject value=location==null?null:new JSONObject().put("latitude",location.getLatitude()).put("longitude",location.getLongitude()).put("accuracy",location.getAccuracy()).put("capturedAt",location.getTime());
                    if(location==null)message("Sem posição disponível. Enviando bateria e rede.");
                    send(value);
                } catch(Exception e) { message(e.getMessage());syncButton.setEnabled(true); }
            });
        } catch(Exception e) { message("Não foi possível obter a localização. Enviando bateria e rede.");send(null); }
    }
    private void send(JSONObject location) {
        syncButton.setEnabled(false);
        io.execute(() -> {
            try { boolean sent=Telemetry.send(this,location); runOnUiThread(() -> { if(!isFinishing()){draw();message(sent?"Atualização recebida pelo servidor.":"Envio pausado. Nenhuma atualização foi enviada.");} }); }
            catch(Exception e) { prefs.edit().putString("error",e.getMessage()).apply();runOnUiThread(() -> { if(!isFinishing()){draw();message(e.getMessage());} }); }
        });
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode,permissions,results);
        if(requestCode==17)waitingForPermission=false;
        if(requestCode==17 && results.length>0 && results[0]==PackageManager.PERMISSION_GRANTED)sync();
        else if(requestCode==17) { shareLocation.setChecked(false); message("Sem localização. Você pode sincronizar bateria e rede."); }
    }
    private void message(String value) { if(!isFinishing())Toast.makeText(this,value==null?"Verifique o servidor e tente novamente.":value,Toast.LENGTH_LONG).show(); }
}
