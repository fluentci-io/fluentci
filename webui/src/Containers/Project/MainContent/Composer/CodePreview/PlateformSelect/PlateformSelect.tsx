import { FC } from "react";
import { PlateformItem } from "./PlateformSelectState";
import { Select } from "baseui/select";
import styles, { Container } from "./styles";

export type PlateformSelectProps = {
  current: PlateformItem[];
  onSelect: (plateform: PlateformItem[]) => void;
  plateforms: PlateformItem[];
};

const PlateformSelect: FC<PlateformSelectProps> = (props) => {
  const { current, plateforms, onSelect } = props;
  return (
    <Container>
      <Select
        overrides={styles.Select}
        clearable={false}
        options={plateforms}
        value={current}
        placeholder="Select color"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange={(params: { value: any }) => {
          onSelect(params.value);
        }}
      />
    </Container>
  );
};

export default PlateformSelect;
