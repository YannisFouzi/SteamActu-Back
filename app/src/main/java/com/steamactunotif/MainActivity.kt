package com.steamactunotif

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.lifecycle.lifecycleScope
import com.google.firebase.messaging.FirebaseMessaging
import com.steamactunotif.api.SteamApiService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MainActivity"
        private const val STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"
        private const val REDIRECT_URL = "steamactunotif://auth"
        private const val REALM = "steamactunotif"
        private const val REQUEST_AUTH = 1001
    }

    private lateinit var steamLoginButton: Button
    private lateinit var statusText: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var sharedPreferences: SharedPreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Initialisation des composants UI
        steamLoginButton = findViewById(R.id.steamLoginButton)
        statusText = findViewById(R.id.statusText)
        progressBar = findViewById(R.id.progressBar)

        // Initialisation des SharedPreferences
        sharedPreferences = getSharedPreferences("SteamActuNotifPrefs", Context.MODE_PRIVATE)

        // Configurer le bouton de connexion
        steamLoginButton.setOnClickListener { initiateLoginFlow() }

        // Vérifier si l'utilisateur est déjà connecté
        if (sharedPreferences.contains("steam_id")) {
            setupFcmTopics()
        }

        // Vérifier si c'est un retour d'authentification
        val uri = intent.data
        if (uri != null && uri.toString().startsWith(REDIRECT_URL)) {
            handleAuthResponse(uri)
        }
    }

    private fun initiateLoginFlow() {
        val authUrl = buildSteamAuthUrl()
        
        // Utiliser Chrome Custom Tabs pour l'authentification
        val customTabsIntent = CustomTabsIntent.Builder().build()
        customTabsIntent.launchUrl(this, Uri.parse(authUrl))
    }

    private fun buildSteamAuthUrl(): String {
        return Uri.parse(STEAM_OPENID_URL).buildUpon()
            .appendQueryParameter("openid.ns", "http://specs.openid.net/auth/2.0")
            .appendQueryParameter("openid.mode", "checkid_setup")
            .appendQueryParameter("openid.return_to", REDIRECT_URL)
            .appendQueryParameter("openid.realm", REALM)
            .appendQueryParameter("openid.identity", "http://specs.openid.net/auth/2.0/identifier_select")
            .appendQueryParameter("openid.claimed_id", "http://specs.openid.net/auth/2.0/identifier_select")
            .build().toString()
    }

    private fun handleAuthResponse(uri: Uri) {
        // Afficher l'état de connexion
        statusText.visibility = View.VISIBLE
        progressBar.visibility = View.VISIBLE
        steamLoginButton.isEnabled = false
        statusText.text = getString(R.string.status_connecting)

        lifecycleScope.launch {
            try {
                // Extraire le Steam ID de la réponse
                val steamId = extractSteamId(uri)
                
                if (steamId != null) {
                    // Sauvegarder le Steam ID
                    sharedPreferences.edit().putString("steam_id", steamId).apply()
                    Log.d(TAG, "Utilisateur connecté avec Steam ID: $steamId")
                    
                    // Configurer les sujets FCM pour les jeux de l'utilisateur
                    setupFcmTopics()
                    
                    // Mettre à jour l'UI
                    statusText.text = getString(R.string.status_connected)
                    Toast.makeText(this@MainActivity, R.string.auth_success, Toast.LENGTH_SHORT).show()
                } else {
                    // Erreur d'authentification
                    statusText.text = getString(R.string.status_error)
                    Toast.makeText(this@MainActivity, R.string.auth_error, Toast.LENGTH_SHORT).show()
                    steamLoginButton.isEnabled = true
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erreur lors de l'authentification: ${e.message}")
                statusText.text = getString(R.string.status_error)
                Toast.makeText(this@MainActivity, R.string.auth_error, Toast.LENGTH_SHORT).show()
                steamLoginButton.isEnabled = true
            } finally {
                progressBar.visibility = View.GONE
            }
        }
    }

    private fun extractSteamId(uri: Uri): String? {
        // Format du retour: steamactunotif://auth?openid.identity=https://steamcommunity.com/openid/id/76561198XXXXXXXXX
        val identity = uri.getQueryParameter("openid.identity") ?: return null
        val regex = Regex("https://steamcommunity.com/openid/id/(\\d+)")
        val matchResult = regex.find(identity)
        return matchResult?.groupValues?.getOrNull(1)
    }

    private fun setupFcmTopics() {
        lifecycleScope.launch {
            try {
                statusText.visibility = View.VISIBLE
                progressBar.visibility = View.VISIBLE
                statusText.text = getString(R.string.loading_games)
                
                // Récupérer le Steam ID
                val steamId = sharedPreferences.getString("steam_id", null) ?: return@launch
                
                // Récupérer la liste des jeux possédés
                val gamesResponse = withContext(Dispatchers.IO) {
                    SteamApiService.create().getOwnedGames(steamId)
                }
                
                // S'abonner aux sujets FCM pour chaque jeu
                if (!gamesResponse.response?.games.isNullOrEmpty()) {
                    val games = gamesResponse.response!!.games!!
                    
                    // S'abonner au sujet FCM global Steam
                    FirebaseMessaging.getInstance().subscribeToTopic("steam_news").await()
                    
                    // S'abonner à chaque jeu individuellement
                    for (game in games) {
                        // Le nom du sujet doit être un format valide pour FCM (pas d'espaces, caractères spéciaux, etc.)
                        val topicName = "game_${game.appid}"
                        FirebaseMessaging.getInstance().subscribeToTopic(topicName).await()
                        Log.d(TAG, "Abonné au sujet FCM: $topicName")
                    }
                    
                    // Mise à jour de l'UI
                    statusText.text = getString(R.string.setup_complete)
                    steamLoginButton.isEnabled = false
                    
                    // Sauvegarder la date de dernière vérification
                    val currentTime = System.currentTimeMillis() / 1000
                    sharedPreferences.edit().putLong("last_check_time", currentTime).apply()
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Erreur lors de la configuration FCM: ${e.message}")
                statusText.text = getString(R.string.status_error)
                steamLoginButton.isEnabled = true
            } finally {
                progressBar.visibility = View.GONE
            }
        }
    }
}