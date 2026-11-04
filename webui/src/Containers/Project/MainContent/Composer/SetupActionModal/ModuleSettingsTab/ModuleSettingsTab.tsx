import { FC } from "react";
import { Checkbox, STYLE_TYPE } from "baseui/checkbox";
import { Pipeline } from "../../NewActionModal/NewActionModalWithData";
import { Controller, useFormContext } from "react-hook-form";

export type ModuleSettingsProps = {
  plugin: Pipeline;
  actionPosition?: number | null;
};

const ModuleSettings: FC<ModuleSettingsProps> = (props) => {
  const { plugin } = props;
  const { control, watch } = useFormContext();
  const checked = watch("useWasmPlugin");
  return (
    <div style={{ marginTop: 15 }}>
      {" "}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          border: "1px solid #5324ff31",
          borderRadius: "5px",
          padding: 20,
        }}
      >
        <div style={{ flex: 1 }}>Use WebAssembly Plugin</div>
        <Controller
          control={control}
          name="useWasmPlugin"
          render={({ field: { onChange, value } }) => (
            <Checkbox
              checked={value}
              onChange={onChange}
              checkmarkType={STYLE_TYPE.toggle_round}
              overrides={{
                Toggle: {
                  style: {
                    backgroundColor: "#fff",
                  },
                },
                ToggleTrack: {
                  style: {
                    backgroundColor: checked ? "#441ecdfe" : "#451ecd52",
                  },
                },
                ToggleInner: {
                  style: {
                    backgroundColor: "#fff",
                  },
                },
                Checkmark: {
                  style: {
                    backgroundColor: "#fff",
                  },
                },
              }}
            />
          )}
        />
      </div>
      <div
        style={{
          marginTop: 20,
          border: "1px solid #5324ff31",
          borderRadius: "5px",
          padding: 20,
        }}
      >
        <label style={{ opacity: 0.6 }}>Plugin</label>
        <div style={{ fontSize: 16 }}>
          {plugin.name.replace("_pipeline", "")}
        </div>
      </div>
      <div
        style={{
          marginTop: 20,
          border: "1px solid #5324ff31",
          borderRadius: "5px",
          padding: 20,
        }}
      >
        <label style={{ opacity: 0.6 }}>Github</label>
        <div>
          <a
            href={plugin.githubUrl}
            style={{ fontSize: 16, color: "#fff" }}
            target="_blank"
          >
            {plugin.githubUrl}
          </a>
        </div>
      </div>
    </div>
  );
};

export default ModuleSettings;
