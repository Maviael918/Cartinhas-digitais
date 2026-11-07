package br.com.racker;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class SyncWorker extends Worker {
    public SyncWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }
    @NonNull @Override public Result doWork() {
        if (isStopped() || !Telemetry.prefs(getApplicationContext()).getBoolean("active", false)) return Result.success();
        try { Telemetry.send(getApplicationContext(), null); return Result.success(); }
        catch (Telemetry.RevokedException ex) { return Result.failure(); }
        catch (Exception ex) {
            Telemetry.prefs(getApplicationContext()).edit().putString("error", "Sem sincronizar: verifique a conexão e o servidor.").apply();
            return getRunAttemptCount() < 3 ? Result.retry() : Result.failure();
        }
    }
}
