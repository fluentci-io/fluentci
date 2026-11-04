import { FC } from "react";
import { Textarea } from "baseui/textarea";
import { Terminal } from "@styled-icons/bootstrap";
import { useFormContext, Controller } from "react-hook-form";
import styles from "./styles";

const Commands: FC = () => {
  const { control, watch } = useFormContext();
  const commands = watch("commands");
  return (
    <div style={{ paddingTop: 20 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Terminal size={18} style={{ marginRight: 10, color: "#a59fad" }} />
        <label style={{ color: "#a59fad" }}>Commands</label>
      </div>
      <Controller
        name="commands"
        control={control}
        render={({ field }) => (
          <Textarea
            {...field}
            clearable
            autoFocus
            overrides={styles.Textarea}
            placeholder="Call a function exposed by the plugin here, e.g. build"
          />
        )}
      />
      {!commands?.length && (
        <div style={{ color: "#ff0077" }}>
          Please provide at least one command
        </div>
      )}
    </div>
  );
};

export default Commands;
