package org.websentinel.app

import java.net.URI

data class Prepared(val origin: String, val discarded: Boolean)

fun prepare(raw: String): Prepared {
    val trimmed = raw.trim()
    require(trimmed.isNotEmpty()) { "Enter a website address." }
    val withScheme = if (trimmed.contains("://")) trimmed else "https://$trimmed"
    val uri = URI(withScheme)
    val userInfo = uri.userInfo
    require(userInfo.isNullOrEmpty()) { "This address contains a username or password. They were not sent." }
    val scheme = uri.scheme?.lowercase()
    require(scheme == "http" || scheme == "https") { "Only http and https addresses can be checked." }
    val host = uri.host ?: throw IllegalArgumentException("Enter a website address.")
    require(!privateHost(host)) { "That host is local, private, or a cloud metadata address. It was not contacted." }
    val discarded = (!uri.path.isNullOrEmpty() && uri.path != "/") || !uri.query.isNullOrEmpty() || !uri.fragment.isNullOrEmpty()
    return Prepared("$scheme://$host", discarded)
}

fun privateHost(host: String): Boolean {
    val h = host.trim().lowercase().removePrefix("[").removeSuffix("]")
    if (h == "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true
    val parts = h.split(".")
    if (parts.size != 4) return false
    val p = parts.mapNotNull { it.toIntOrNull() }
    if (p.size != 4) return false
    if (p[0] == 127 || p[0] == 10 || p[0] == 0) return true
    if (p[0] == 192 && p[1] == 168) return true
    if (p[0] == 169 && p[1] == 254) return true
    if (p[0] == 172 && p[1] in 16..31) return true
    return false
}
