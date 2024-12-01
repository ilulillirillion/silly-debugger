import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { eventSource, event_types } from "../../../../script.js";
import { writeFile, readFile } from "../../../../utils.js";

const extensionName = "prompt-logger";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const logFilePath = 'logs/prompt_logs.jsonl';

// Default settings
const defaultSettings = {
    logPrompt: true,
    logHistory: true,
    logContext: true
};

let extensionSettings = extension_settings[extensionName];

// Load or initialize settings
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    extensionSettings = extension_settings[extensionName];

    // Update UI to match settings
    $("#log_prompt").prop("checked", extensionSettings.logPrompt);
    $("#log_history").prop("checked", extensionSettings.logHistory);
    $("#log_context").prop("checked", extensionSettings.logContext);
}

// Save settings when checkboxes change
function onSettingInput(event) {
    const settingId = event.target.id.replace('log_', '');
    const settingKey = `log${settingId.charAt(0).toUpperCase()}${settingId.slice(1)}`;
    extensionSettings[settingKey] = Boolean($(event.target).prop("checked"));
    saveSettingsDebounced();
}

// Log information to file
async function logToFile(data) {
    try {
        const context = getContext();
        const logEntry = {
            timestamp: new Date().toISOString(),
            characterName: context.name2,
            data: {}
        };

        if (extensionSettings.logPrompt && data.finalPrompt) {
            logEntry.data.finalPrompt = data.finalPrompt;
        }

        if (extensionSettings.logHistory && data.messageHistory) {
            logEntry.data.messageHistory = data.messageHistory;
        }

        if (extensionSettings.logContext) {
            logEntry.data.context = {
                worldInfo: context.worldInfo,
                characters: context.characters,
                groups: context.groups,
                chatMetadata: context.chat_metadata,
            };
        }

        // Append to log file
        const logLine = JSON.stringify(logEntry) + '\n';
        await writeFile(logFilePath, logLine, true);
    } catch (error) {
        console.error('Failed to log prompt data:', error);
        toastr.error('Failed to log prompt data. Check console for details.');
    }
}

// View logs
async function viewLogs() {
    try {
        const logContent = await readFile(logFilePath);
        if (!logContent) {
            $('#log_content').text('No logs found.');
        } else {
            // Format logs for display
            const logs = logContent.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    try {
                        const entry = JSON.parse(line);
                        return `[${entry.timestamp}] ${entry.characterName}\n${JSON.stringify(entry.data, null, 2)}\n`;
                    } catch (e) {
                        return line;
                    }
                })
                .join('\n---\n\n');
            
            $('#log_content').text(logs);
        }
        $('#log_viewer').show();
    } catch (error) {
        console.error('Failed to read logs:', error);
        toastr.error('Failed to read logs. Check console for details.');
    }
}

// Clear logs
async function clearLogs() {
    try {
        await writeFile(logFilePath, '');
        $('#log_content').text('No logs found.');
        toastr.success('Logs cleared successfully');
    } catch (error) {
        console.error('Failed to clear logs:', error);
        toastr.error('Failed to clear logs. Check console for details.');
    }
}

// Export logs
async function exportLogs() {
    try {
        const logContent = await readFile(logFilePath);
        if (!logContent) {
            toastr.info('No logs to export');
            return;
        }

        const blob = new Blob([logContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `prompt_logs_${new Date().toISOString().split('T')[0]}.jsonl`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Failed to export logs:', error);
        toastr.error('Failed to export logs. Check console for details.');
    }
}

// Initialize extension
jQuery(async () => {
    // Load HTML
    const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
    $("#extensions_settings").append(settingsHtml);

    // Load settings
    await loadSettings();

    // Setup event listeners
    $("#log_prompt, #log_history, #log_context").on("input", onSettingInput);
    $("#view_logs").on("click", viewLogs);
    $("#clear_logs").on("click", clearLogs);
    $("#export_logs").on("click", exportLogs);
    $(".close-viewer").on("click", () => $("#log_viewer").hide());

    // Listen for chat completion events
    eventSource.on(event_types.CHAT_COMPLETION_RESPONSE, async (data) => {
        if (data && (extensionSettings.logPrompt || extensionSettings.logHistory || extensionSettings.logContext)) {
            await logToFile(data);
        }
    });
});
