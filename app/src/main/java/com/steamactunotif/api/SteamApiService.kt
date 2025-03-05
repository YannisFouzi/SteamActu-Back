package com.steamactunotif.api

import com.steamactunotif.api.model.NewsResponse
import com.steamactunotif.api.model.OwnedGamesResponse
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Interface pour les appels à l'API Steam
 */
interface SteamApiService {

    /**
     * Récupère la liste des jeux possédés par l'utilisateur
     * Utilise l'API publique du profil Steam
     */
    @GET("IPlayerService/GetOwnedGames/v0001/?format=json&include_appinfo=1")
    suspend fun getOwnedGames(
        @Query("steamid") steamId: String
    ): OwnedGamesResponse

    /**
     * Récupère les actualités d'un jeu spécifique
     * Cet endpoint ne nécessite pas de clé API
     */
    @GET("ISteamNews/GetNewsForApp/v0002/?format=json")
    suspend fun getNewsForApp(
        @Query("appid") appId: Int,
        @Query("count") count: Int = 10,
        @Query("maxlength") maxLength: Int = 300,
        @Query("enddate") endDate: Int? = null
    ): NewsResponse

    companion object {
        private const val BASE_URL = "https://api.steampowered.com/"

        fun create(): SteamApiService {
            val logger = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }

            val client = OkHttpClient.Builder()
                .addInterceptor(logger)
                .build()

            return Retrofit.Builder()
                .baseUrl(BASE_URL)
                .client(client)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
                .create(SteamApiService::class.java)
        }
    }
}