console.log("CHAOSFILL_APP: Host UI Script.js loaded");

function show(enabled, useSettingsInsteadOfPreferences) {
    console.log("CHAOSFILL_APP: show(enabled=%o, useSettingsInsteadOfPreferences=%o)", enabled, useSettingsInsteadOfPreferences);
    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName('state-on')[0].innerText = "ChaosFill’s extension is currently on. You can turn it off in the Extensions section of Safari Settings.";
        document.getElementsByClassName('state-off')[0].innerText = "ChaosFill’s extension is currently off. You can turn it on in the Extensions section of Safari Settings.";
        document.getElementsByClassName('state-unknown')[0].innerText = "You can turn on ChaosFill’s extension in the Extensions section of Safari Settings.";
        document.getElementsByClassName('open-preferences')[0].innerText = "Quit and Open Safari Settings…";
    }

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function openPreferences() {
    console.log("CHAOSFILL_APP: openPreferences() clicked, sending WK message 'open-preferences'");
    try {
        webkit.messageHandlers.controller.postMessage("open-preferences");
    } catch (error) {
        console.error("CHAOSFILL_APP: Failed to send WK message", error);
    }
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
