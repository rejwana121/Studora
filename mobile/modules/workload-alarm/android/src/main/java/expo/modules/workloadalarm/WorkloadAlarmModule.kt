package expo.modules.workloadalarm

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WorkloadAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WorkloadAlarm")

    Function("isActive") {
      WorkloadAlarmService.isRunning
    }

    // Idempotent by design: the service itself no-ops a duplicate start
    // (see WorkloadAlarmService.onStartCommand) rather than relying on the
    // JS caller to avoid double-invoking this.
    AsyncFunction("start") { deepLinkUrl: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val intent = Intent(context, WorkloadAlarmService::class.java).apply {
        action = WorkloadAlarmService.ACTION_START
        putExtra(WorkloadAlarmService.EXTRA_DEEP_LINK_URL, deepLinkUrl)
      }
      ContextCompat.startForegroundService(context, intent)
    }

    // No-ops entirely (never even sends an Intent) when nothing is running,
    // avoiding any background-start restriction on a plain startService()
    // call — the service, once genuinely running, may always be re-signaled
    // via startService() without hitting that restriction.
    AsyncFunction("stop") {
      val context = appContext.reactContext ?: return@AsyncFunction null
      if (!WorkloadAlarmService.isRunning) return@AsyncFunction null
      val intent = Intent(context, WorkloadAlarmService::class.java).apply {
        action = WorkloadAlarmService.ACTION_STOP
      }
      context.startService(intent)
    }
  }
}
