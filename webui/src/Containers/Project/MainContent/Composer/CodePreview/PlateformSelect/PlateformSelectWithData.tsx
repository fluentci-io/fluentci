import { FC } from "react";
import PlateformSelect from "./PlateformSelect";
import { plateforms } from "./consts";
import { useRecoilState } from "recoil";
import { PlateformSelectState } from "./PlateformSelectState";

const PlateformSelectWithData: FC = () => {
  const [currentPlateform, setCurrentPlateform] =
    useRecoilState(PlateformSelectState);

  return (
    <PlateformSelect
      current={currentPlateform}
      plateforms={plateforms}
      onSelect={setCurrentPlateform}
    />
  );
};

export default PlateformSelectWithData;
