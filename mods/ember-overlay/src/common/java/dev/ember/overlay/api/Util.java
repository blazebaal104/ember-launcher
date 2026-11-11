package dev.ember.overlay.api;

import java.nio.file.Path;
import java.util.Locale;

/** Version-independent helpers. */
public final class Util {
    private Util() {}

    public static final String MOD_ID = "ember-overlay";

    /** Open a file or folder with the OS (avoids version-specific Util APIs). */
    public static void openPath(Path path) {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        String[] cmd = os.contains("win") ? new String[]{"explorer", path.toString()}
                : os.contains("mac") ? new String[]{"open", path.toString()}
                : new String[]{"xdg-open", path.toString()};
        try {
            new ProcessBuilder(cmd).start();
        } catch (Exception e) {
            System.err.println("[ember-overlay] could not open " + path + ": " + e);
        }
    }

    public static String prettify(String path) {
        StringBuilder sb = new StringBuilder();
        for (String part : path.split("_")) {
            if (part.isEmpty()) continue;
            if (!sb.isEmpty()) sb.append(' ');
            sb.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
        }
        return sb.toString();
    }
}
