package com.steamactunotif.api.model

import com.google.gson.annotations.SerializedName

/**
 * Modèle pour la réponse de l'API des jeux possédés
 */
data class OwnedGamesResponse(
    @SerializedName("response") val response: OwnedGamesResult?
)

data class OwnedGamesResult(
    @SerializedName("game_count") val gameCount: Int?,
    @SerializedName("games") val games: List<Game>?
)

data class Game(
    @SerializedName("appid") val appid: Int,
    @SerializedName("name") val name: String?,
    @SerializedName("img_icon_url") val iconUrl: String?,
    @SerializedName("img_logo_url") val logoUrl: String?,
    @SerializedName("playtime_forever") val playtimeForever: Int?
)

/**
 * Modèle pour la réponse de l'API des actualités
 */
data class NewsResponse(
    @SerializedName("appnews") val appnews: AppNews?
)

data class AppNews(
    @SerializedName("appid") val appid: Int?,
    @SerializedName("newsitems") val newsitems: List<NewsItem>?,
    @SerializedName("count") val count: Int?
)

data class NewsItem(
    @SerializedName("gid") val gid: String?,
    @SerializedName("title") val title: String?,
    @SerializedName("url") val url: String?,
    @SerializedName("author") val author: String?,
    @SerializedName("contents") val contents: String?,
    @SerializedName("feedlabel") val feedlabel: String?,
    @SerializedName("date") val date: Long?,
    @SerializedName("feedname") val feedname: String?,
    @SerializedName("feed_type") val feedType: Int?,
    @SerializedName("appid") val appid: Int?
)