package expo.modules.workloadalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Minimal hand-written foreground service for the workload alarm. Reactive
 * only — always started from an already-qualifying workload transition in
 * JS (see workload-alert.ts); this class never schedules or predicts
 * anything itself, and never uses a full-screen intent.
 *
 * Lifecycle: START_NOT_STICKY throughout. A system-initiated restart after
 * process death (the only case START_STICKY would help) would redeliver a
 * null Intent with no deep-link URL and no evidence the workload is still
 * qualifying — resuming looped alarm audio at that point could revive an
 * alert the user already dismissed by swiping the app away, with no way to
 * safely re-derive whether it should still be playing. JS re-invokes
 * start() on its own next qualifying check instead, which is the only
 * point that actually knows the current workload state.
 */
class WorkloadAlarmService : Service() {

  private var mediaPlayer: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var deepLinkUrl: String? = null

  companion object {
    private const val TAG = "WorkloadAlarmService"

    const val ACTION_START = "expo.modules.workloadalarm.action.START"
    const val ACTION_STOP = "expo.modules.workloadalarm.action.STOP"
    const val EXTRA_DEEP_LINK_URL = "expo.modules.workloadalarm.extra.DEEP_LINK_URL"

    private const val CHANNEL_ID = "workload-alarm-service-v1"
    private const val NOTIFICATION_ID = 9821
    private const val RAW_SOUND_NAME = "studora_alarm_loop"
    private const val WAKE_LOCK_TAG = "WorkloadAlarm:ServiceWakeLock"
    // Safety-net ceiling only — real release always happens via
    // stopAlarm()/onDestroy(); this bounds the damage if some future path
    // ever fails to reach either.
    private const val WAKE_LOCK_SAFETY_TIMEOUT_MS = 60 * 60 * 1000L

    @Volatile
    var isRunning: Boolean = false
      private set
  }

  override fun onBind(intent: Intent?) = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        intent.getStringExtra(EXTRA_DEEP_LINK_URL)?.let { deepLinkUrl = it }
        // Every startForegroundService() call must be answered with
        // startForeground() from this callback — the OS enforces this per
        // call, not once per service lifetime, so this still runs even on
        // the idempotent "already playing" path below.
        try {
          startForeground(NOTIFICATION_ID, buildNotification())
        } catch (t: Throwable) {
          Log.w(TAG, "startForeground failed", t)
          stopAlarm()
          return START_NOT_STICKY
        }
        if (!isRunning) startAlarm()
        return START_NOT_STICKY
      }
      ACTION_STOP -> {
        stopAlarm()
        return START_NOT_STICKY
      }
      else -> {
        stopSelf()
        return START_NOT_STICKY
      }
    }
  }

  private fun startAlarm() {
    try {
      acquireWakeLock()
      val resId = resources.getIdentifier(RAW_SOUND_NAME, "raw", packageName)
      if (resId == 0) {
        Log.w(TAG, "Alarm sound resource not found")
        stopAlarm()
        return
      }
      val player = MediaPlayer.create(this, resId)
      if (player == null) {
        Log.w(TAG, "MediaPlayer.create returned null")
        stopAlarm()
        return
      }
      player.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      player.isLooping = true
      player.setOnErrorListener { _, _, _ ->
        Log.w(TAG, "MediaPlayer reported an error; stopping alarm")
        stopAlarm()
        true
      }
      player.start()
      mediaPlayer = player
      isRunning = true
    } catch (t: Throwable) {
      Log.w(TAG, "Failed to start alarm playback", t)
      stopAlarm()
    }
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
    val lock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG)
    lock.setReferenceCounted(false)
    lock.acquire(WAKE_LOCK_SAFETY_TIMEOUT_MS)
    wakeLock = lock
  }

  private fun releaseWakeLock() {
    try {
      wakeLock?.let { if (it.isHeld) it.release() }
    } catch (t: Throwable) {
      Log.w(TAG, "Wake lock release failed", t)
    } finally {
      wakeLock = null
    }
  }

  /** Idempotent: safe to call repeatedly (already-stopped, mid-teardown, or
   * never-started) without throwing or double-releasing anything. */
  private fun stopAlarm() {
    try {
      mediaPlayer?.let { player ->
        try {
          if (player.isPlaying) player.stop()
        } catch (t: Throwable) {
          // stop() can throw from an invalid player state — release()
          // below still runs regardless via the outer try/finally shape.
        }
        player.release()
      }
    } catch (t: Throwable) {
      Log.w(TAG, "MediaPlayer teardown failed", t)
    } finally {
      mediaPlayer = null
    }
    releaseWakeLock()
    isRunning = false
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun ensureChannel(manager: NotificationManager) {
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Workload alarm", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Ongoing alert while a heavy-workload alarm is active"
      // Audio is owned exclusively by this service's looping MediaPlayer —
      // the channel itself must never play a second sound.
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    ensureChannel(manager)

    val stopPendingIntent = PendingIntent.getService(
      this,
      1,
      Intent(this, WorkloadAlarmService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    // Deliberately PendingIntent.getActivity() here, not getService(): a
    // notification action that starts an Activity from an intermediary
    // Service/BroadcastReceiver ("notification trampoline") is blocked on
    // apps targeting Android 12+. The deep link (from expo-linking's
    // Linking.createURL, supplied by JS at start() time — never hardcoded
    // here) opens the app directly and compliantly; the /workload screen
    // itself calls stopWorkloadAlarm() once it lands there (see
    // workload-alarm-controller.ts / workload.tsx), so cleanup still always
    // happens, just JS-side instead of natively for this one action. "Stop
    // Alert" above is unaffected — it never starts an Activity, so it isn't
    // a trampoline and stays fully native/instant.
    val takeBreakPendingIntent = deepLinkUrl?.let { url ->
      PendingIntent.getActivity(
        this,
        2,
        Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          setPackage(packageName)
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    } ?: stopPendingIntent // no deep link was ever supplied — fall back to a safe no-navigation stop rather than a broken action

    // Resolved at runtime rather than hardcoded: prefers the host app's own
    // generated notification icon if present, falling back to a stock
    // system glyph so this module never assumes/embeds the app's package.
    val iconResId = resources.getIdentifier("notification_icon", "drawable", packageName)
      .takeIf { it != 0 } ?: android.R.drawable.ic_lock_idle_alarm

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(iconResId)
      .setContentTitle("Workload alarm active")
      .setContentText("Your workload is still heavy. Stop the alert or take a break.")
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .addAction(0, "Stop Alert", stopPendingIntent)
      .addAction(0, "Take a Break", takeBreakPendingIntent)
      .build()
    // Deliberately no setFullScreenIntent(...) — never used in this checkpoint.
  }

  override fun onDestroy() {
    // Defensive-only: covers any path that reaches destruction without
    // having gone through stopAlarm() first (e.g. the system tearing the
    // service down directly). stopAlarm() is itself idempotent.
    if (isRunning || mediaPlayer != null || wakeLock?.isHeld == true) {
      stopAlarm()
    }
    super.onDestroy()
  }
}
