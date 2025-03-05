package com.steamactunotif.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.steamactunotif.R
import com.steamactunotif.util.Constants

class SteamNotificationService : FirebaseMessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        // Extraire les données de la notification
        val title = remoteMessage.data["title"] ?: "Actualité Steam"
        val message = remoteMessage.data["message"] ?: "Nouvelle actualité disponible"
        val gameId = remoteMessage.data["gameId"]
        val newsId = remoteMessage.data["newsId"]
        val url = remoteMessage.data["url"]

        // Créer et afficher la notification
        sendNotification(title, message, gameId, newsId, url)
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Envoyer le nouveau token au serveur si nécessaire
    }

    private fun sendNotification(
        title: String, 
        message: String, 
        gameId: String?, 
        newsId: String?,
        url: String?
    ) {
        // Créer un intent pour ouvrir Steam lorsque la notification est cliquée
        val intent = if (url != null) {
            // Essayer d'ouvrir l'URL dans l'application Steam
            Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse(url)
                setPackage("com.valvesoftware.android.steam.community")
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
        } else if (gameId != null) {
            // Si pas d'URL spécifique, ouvrir la page du jeu
            Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("https://store.steampowered.com/app/$gameId")
                setPackage("com.valvesoftware.android.steam.community")
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
        } else {
            // Fallback à l'application Steam générique
            packageManager.getLaunchIntentForPackage("com.valvesoftware.android.steam.community")
                ?: Intent(Intent.ACTION_VIEW, Uri.parse("https://store.steampowered.com"))
        }

        val pendingIntent = PendingIntent.getActivity(
            this, 
            0, 
            intent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )

        val channelId = Constants.NOTIFICATION_CHANNEL_ID
        val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        
        // Création de la notification
        val notificationBuilder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(message)
            .setAutoCancel(true)
            .setSound(defaultSoundUri)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Création du canal de notification pour Android O et versions ultérieures
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = getString(R.string.notification_channel_description)
                enableLights(true)
                enableVibration(true)
            }
            notificationManager.createNotificationChannel(channel)
        }

        // Affichage de la notification
        val notificationId = System.currentTimeMillis().toInt()
        notificationManager.notify(notificationId, notificationBuilder.build())
    }
}