import { observer } from "mobx-react-lite";
import React from "react";
import { OPENAI_API_URL } from "open-tts";
import { TTSPluginSettingsStore } from "open-tts";
import { ApiKeyComponent } from "../api-key-component";
import {
  OptionSelectSetting,
  TextInputSetting,
  SliderSetting,
} from "../setting-components";

const AUDIO_FORMAT_OPTIONS = [
  { label: "MP3", value: "mp3" },
  { label: "WAV", value: "wav" },
  { label: "PCM", value: "pcm" },
] as const;

type OpenAICompatProfile =
  TTSPluginSettingsStore["settings"]["openaicompat_profiles"][number];

function createProfileId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `openaicompat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getCurrentOpenAICompatProfile(
  store: TTSPluginSettingsStore,
  id: string,
  name: string,
): OpenAICompatProfile {
  return {
    id,
    name,
    apiKey: store.settings.openaicompat_apiKey,
    apiBase: store.settings.openaicompat_apiBase,
    ttsModel: store.settings.openaicompat_ttsModel,
    ttsVoice: store.settings.openaicompat_ttsVoice,
    responseFormat: store.settings.openaicompat_responseFormat,
    generationSpeed: store.settings.openaicompat_generationSpeed,
  };
}

async function loadOpenAICompatProfile(
  store: TTSPluginSettingsStore,
  profile: OpenAICompatProfile,
) {
  await store.updateModelSpecificSettings("openaicompat", {
    openaicompat_activeProfileId: profile.id,
    openaicompat_apiKey: profile.apiKey,
    openaicompat_apiBase: profile.apiBase,
    openaicompat_ttsModel: profile.ttsModel,
    openaicompat_ttsVoice: profile.ttsVoice,
    openaicompat_responseFormat: profile.responseFormat,
    openaicompat_generationSpeed: profile.generationSpeed,
  });
}

const OpenAICompatibleProfilesComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const profiles = store.settings.openaicompat_profiles ?? [];
  const activeProfile = profiles.find(
    (profile) => profile.id === store.settings.openaicompat_activeProfileId,
  );

  const [profileName, setProfileName] = React.useState(
    activeProfile?.name ?? "",
  );

  React.useEffect(() => {
    setProfileName(activeProfile?.name ?? "");
  }, [activeProfile?.id, activeProfile?.name]);

  async function saveProfile() {
    const name = profileName.trim() || activeProfile?.name || "Default";
    const id = activeProfile?.id ?? createProfileId();
    const updatedProfile = getCurrentOpenAICompatProfile(store, id, name);

    const nextProfiles = activeProfile
      ? profiles.map((profile) =>
          profile.id === activeProfile.id ? updatedProfile : profile,
        )
      : [...profiles, updatedProfile];

    await store.updateModelSpecificSettings("openaicompat", {
      openaicompat_activeProfileId: id,
      openaicompat_profiles: nextProfiles,
    });
  }

  async function saveAsNewProfile() {
    const name = profileName.trim() || "New profile";
    const id = createProfileId();
    const newProfile = getCurrentOpenAICompatProfile(store, id, name);

    await store.updateModelSpecificSettings("openaicompat", {
      openaicompat_activeProfileId: id,
      openaicompat_profiles: [...profiles, newProfile],
    });
  }

  async function deleteProfile() {
    if (!activeProfile) {
      return;
    }

    const nextProfiles = profiles.filter(
      (profile) => profile.id !== activeProfile.id,
    );

    await store.updateModelSpecificSettings("openaicompat", {
      openaicompat_activeProfileId: "",
      openaicompat_profiles: nextProfiles,
    });

    setProfileName("");
  }

  return (
    <>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Profile</div>
          <div className="setting-item-description">
            Save and switch between multiple OpenAI-compatible API
            configurations.
          </div>
        </div>
        <div className="setting-item-control">
          <select
            value={store.settings.openaicompat_activeProfileId}
            onChange={async (event) => {
              const profile = profiles.find(
                (item) => item.id === event.target.value,
              );

              if (profile) {
                await loadOpenAICompatProfile(store, profile);
              } else {
                await store.updateModelSpecificSettings("openaicompat", {
                  openaicompat_activeProfileId: "",
                });
              }
            }}
          >
            <option value="">No profile selected</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Save Profile</div>
          <div className="setting-item-description">
            Optional. Create a saved profile only if you want to switch between
            multiple OpenAI-compatible APIs.
          </div>
        </div>
        <div className="setting-item-control">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              alignItems: "stretch",
              width: "100%",
            }}
          >
            <input
              type="text"
              value={profileName}
              placeholder="Example: Openrouter Kok"
              onChange={(event) => setProfileName(event.target.value)}
            />

            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "nowrap",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                onClick={saveProfile}
                style={{ whiteSpace: "nowrap" }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={saveAsNewProfile}
                style={{ whiteSpace: "nowrap" }}
              >
                Save as new
              </button>
              <button
                type="button"
                onClick={deleteProfile}
                disabled={!activeProfile}
                style={{ whiteSpace: "nowrap" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

export const OpenAICompatibleSettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <OpenAICompatibleProfilesComponent store={store} />

        <ApiKeyComponent
          store={store}
          provider="openaicompat"
          fieldName="openaicompat_apiKey"
          displayName="API key"
          helpText="A Bearer token for your API"
        />
        <OpenAICompatibleAPIBaseURLComponent store={store} />
        <TextInputSetting
          name="Model"
          description="The model parameter."
          store={store}
          provider="openaicompat"
          fieldName="openaicompat_ttsModel"
        />
        <TextInputSetting
          name="Custom OpenAI Voice"
          description="The voice parameter."
          store={store}
          provider="openaicompat"
          fieldName="openaicompat_ttsVoice"
        />
        <SliderSetting
          name="Generation Speed"
          description="Generation speed sent to the TTS API when creating audio. This is different from the local playback speed control. Support depends on the provider/model; it works with some OpenRouter TTS models such as Kokoro."
          store={store}
          provider="openaicompat"
          fieldName="openaicompat_generationSpeed"
          min={0.3}
          max={2.5}
          step={0.05}
          defaultValue={1}
          formatValue={(value) => `${value.toFixed(2)}x`}
        />
        <OptionSelectSetting
          name="Audio Format"
          description="The audio format to request from the API."
          store={store}
          provider="openaicompat"
          fieldName="openaicompat_responseFormat"
          options={AUDIO_FORMAT_OPTIONS}
        />
      </>
    );
  },
);

const OpenAICompatibleAPIBaseURLComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  function isValidURL(url: string) {
    if (!url) {
      return true;
    }
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }

  return (
    <TextInputSetting
      name="API URL"
      description="Base URL for OpenAI compatible API."
      store={store}
      fieldName="openaicompat_apiBase"
      placeholder={OPENAI_API_URL}
      validation={{
        validate: isValidURL,
        errorMessage: "Please enter a valid URL (e.g. https://api.example.com)",
      }}
    />
  );
});
