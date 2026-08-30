package com.lexfield.app.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

// Endfield family: charcoal ink, paper text, signal yellow, verified green
object ArkColors {
    val Ink = Color(0xFF191919)
    val InkSoft = Color(0xFF202020)
    val InkSoft2 = Color(0xFF262626)
    val Paper = Color(0xFFF2F2F0)
    val PaperMuted = Color(0xFF9C9C96)
    val Signal = Color(0xFFFFFA00)
    val SignalDim = Color(0xFFE8E000)
    val State = Color(0xFF00FFA2)
    val Rule = Color(0xFF3A3A36)
}

private val EndfieldScheme = darkColorScheme(
    primary = ArkColors.Signal,
    onPrimary = ArkColors.Ink,
    primaryContainer = ArkColors.SignalDim,
    onPrimaryContainer = ArkColors.Ink,
    secondary = ArkColors.State,
    onSecondary = ArkColors.Ink,
    background = ArkColors.Ink,
    onBackground = ArkColors.Paper,
    surface = ArkColors.InkSoft,
    onSurface = ArkColors.Paper,
    surfaceVariant = ArkColors.InkSoft2,
    onSurfaceVariant = ArkColors.PaperMuted,
    outline = ArkColors.Rule,
    error = Color(0xFFFF8A80),
)

private val ArkTypography = Typography()

val ArkShape = RoundedCornerShape(2.dp)

@Composable
fun LexFieldTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = EndfieldScheme,
        typography = ArkTypography.copy(
            titleLarge = ArkTypography.titleLarge.copy(fontWeight = FontWeight.Bold),
        ),
        content = content,
    )
}

/** section header in the Endfield grammar: NN / NN + zh title + en micro label */
@Composable
fun SectionLabel(index: String, title: String, en: String) {
    androidx.compose.foundation.layout.Column {
        androidx.compose.material3.Text(
            "$index / $en",
            style = MaterialTheme.typography.labelSmall,
            fontFamily = FontFamily.Monospace,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        androidx.compose.material3.Text(
            title,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
        )
    }
}
