package com.steamactunotif.util

/**
 * Classe contenant les constantes utilisées dans l'application
 */
object Constants {
    const val NOTIFICATION_CHANNEL_ID = "steam_news_channel"
    
    // Fréquences de vérification en minutes
    val CHECK_FREQUENCIES = mapOf(
        0 to 15,    // 15 minutes
        1 to 30,    // 30 minutes
        2 to 60,    // 1 heure
        3 to 180,   // 3 heures
        4 to 360,   // 6 heures
        5 to 720,   // 12 heures
        6 to 1440   // 24 heures
    )
}