package dev.ember.overlay.core;

import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Finds installed mods that already do what an Ember feature does, so the menu can say
 * "You already have Zoomify" instead of letting players stack two zooms or two armor HUDs.
 *
 * Matching is by fragments of the mod id or name (lower-cased, spaces/dashes/underscores
 * removed), which catches forks and renamed builds too. The table covers the popular Modrinth
 * and CurseForge mods that overlap a feature; most of the top 500 mods (content, libraries,
 * performance) overlap none.
 */
public final class ModScan {
    private ModScan() {}

    private static final Map<String, String[]> OVERLAPS = new LinkedHashMap<>();

    private static void map(String feature, String... fragments) {
        OVERLAPS.put(feature, fragments);
    }

    static {
        // HUD
        map("fps", "fpsdisplay", "fpscounter", "fpshud", "showfps", "minihud", "betterhud", "infohud", "simplehud");
        map("cps", "cpsdisplay", "cpscounter", "cpsmod", "clickspersecond");
        map("keystrokes", "keystrokes", "keystroke");
        map("ping", "betterpingdisplay", "pingdisplay", "pinghud", "showping");
        map("coords", "coordinatesdisplay", "coordinateshud", "coordshud", "showcoordinates", "minihud", "betterhud", "infohud", "simplehud", "xaerominimap", "journeymap", "voxelmap");
        map("direction", "minihud", "coordinatesdisplay", "infohud", "simplehud", "compasshud", "betterhud");
        map("biome", "minihud", "infohud", "biomehud", "betterhud");
        map("armor", "armorhud", "armorstatus", "armourhud", "durabilityviewer", "armorpointshud", "betterhud", "statuseffectbars", "simplehud", "giselbaer", "durabilityhud");
        map("potions", "statuseffecttimer", "statuseffectbars", "effecttimer", "potiontimer", "potionhud", "betterpotioneffects", "effectstimer", "moreoverlays");
        map("clock", "minihud", "clockhud", "realtimeclock", "infohud");
        map("speed", "minihud", "speedometer", "speedhud");
        map("memory", "minihud", "memoryusage");
        map("day", "minihud", "daycounter", "infohud");
        map("held", "durabilityviewer", "durability101", "durabilityhud", "itemcounts", "betterhud");
        map("arrows", "arrowcounter", "itemcounts", "durabilityviewer");
        map("light", "minihud", "lightoverlay", "lightlevel");
        map("chunk", "minihud");
        map("entities", "minihud");
        map("target", "jade", "wthit", "waila", "hwyla", "whatareyoulookingat");
        map("food", "appleskin", "betterhunger", "hungerhud");
        map("minimap", "xaerominimap", "journeymap", "voxelmap", "ftbchunks", "antiquemap", "minimap", "mapatlases");
        map("worldmap", "xaeroworldmap", "journeymap", "voxelmap", "ftbchunks", "antiquemap");
        // Visual
        map("fullbright", "fullbright", "gammautils", "brightnessutils", "gammaplus", "nightvisionmod");
        map("zoom", "zoomify", "okzoomer", "logicalzoom", "wizoom", "simplezoom", "justzoom", "zoomer", "spyglassplus");
        map("crosshair", "dynamiccrosshair", "customcrosshair", "crosshairaddons", "crosshairtweaks", "crosshairmod");
        map("particles", "particlelimiter", "reducedparticles", "particlecontrol", "particlesenhanced", "particletweaks");
        map("minimal_bob", "nobob", "betterbobbing", "bobbingtweaks", "viewbobbing");
        map("hide_scoreboard", "scoreboardtweaks", "hidescoreboard", "nicerscoreboard");
        map("hide_bossbar", "bossbartweaks", "hidebossbar", "betterbossbar");
        map("low_health", "lowhealth", "healthindicator", "damagetint", "healthoverlay");
        map("durability_warning", "durabilitynotifier", "durabilitywarning", "armorhud", "durabilitytooltip", "durabilityviewer", "toolbreakwarn");
        map("clear_water", "clearwater", "fogtweaks", "nofog", "betterclouds");
        map("item_physics", "itemphysic");
        map("block_outline", "blockoutline", "selectionhighlight", "betterblockoutline");
        map("low_fire", "lowfire", "lowerfire", "firetweaks", "lowshield");
        map("cinematic_key", "cinematictoggle", "replaymod");
        // Utility
        map("freelook", "freelook", "perspective", "betterthirdperson", "shouldersurfing", "f5fix");
        map("macros", "chatmacros", "commandmacros", "macrokey", "keybindmacros");
        map("chat_filter", "chatfilter", "chatpatches", "nochatreports");
        map("inventory_search", "inventorysearch", "itemsearch", "chestsearch", "roughlyenoughitems", "emi");
        map("screenshot_manager", "screenshotviewer", "screenshotmanager", "screenshotsorganizer");
        map("toggle_sprint", "togglesprint", "autosprint", "alwayssprint");
        map("toggle_sneak", "togglesneak", "togglesprint");
        map("death_coords", "deathcoords", "deathfinder", "deathwaypoint", "corpse", "gravestone", "xaerominimap");
        map("reconnect", "autoreconnect", "reconnectbutton", "reconnect");
        map("copy_coords", "copycoords", "coordinatescopy", "xaerominimap");
        map("server_switcher", "serverswitcher", "quickserver");
    }

    /** Short names so "Mod Menu" style ids don't match a feature by accident. */
    private static final List<String> IGNORE = List.of("minecraft", "java", "fabricloader", "fabric", "quilt", "ember", "mixinextras");

    private static String norm(String s) {
        return s.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    /** Fills {@link Feature#providedBy} for every feature. */
    public static void run() {
        List<String[]> mods = new ArrayList<>(); // {normalised id, normalised name, display name}
        for (ModContainer m : FabricLoader.getInstance().getAllMods()) {
            var meta = m.getMetadata();
            String id = meta.getId();
            if (id.startsWith("fabric-") || id.startsWith("quilted_") || id.startsWith("ember-") || IGNORE.contains(id)) continue;
            if (m.getContainingMod().isPresent()) continue; // bundled library inside another mod
            mods.add(new String[]{norm(id), norm(meta.getName()), meta.getName()});
        }
        for (Feature f : FeatureRegistry.all()) {
            f.providedBy = null;
            String[] fragments = OVERLAPS.get(f.id);
            if (fragments == null) continue;
            outer:
            for (String frag : fragments) {
                for (String[] m : mods) {
                    boolean exact = frag.length() <= 4; // "emi", "jade": whole-id match only
                    if (exact ? m[0].equals(frag) || m[1].equals(frag) : m[0].contains(frag) || m[1].contains(frag)) {
                        f.providedBy = m[2];
                        break outer;
                    }
                }
            }
        }
    }
}
